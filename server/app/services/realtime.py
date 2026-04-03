from __future__ import annotations

import asyncio
from dataclasses import dataclass

from fastapi import WebSocket

from app.services.matching import haversine_km


class RideSocketHub:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ride_uid: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections.setdefault(ride_uid, set()).add(websocket)

    async def disconnect(self, ride_uid: str, websocket: WebSocket) -> None:
        async with self._lock:
            listeners = self._connections.get(ride_uid)
            if not listeners:
                return

            listeners.discard(websocket)
            if not listeners:
                self._connections.pop(ride_uid, None)

    async def broadcast(self, ride_uid: str, payload: dict[str, object]) -> None:
        async with self._lock:
            listeners = list(self._connections.get(ride_uid, set()))

        for socket in listeners:
            try:
                await socket.send_json(payload)
            except Exception:
                await self.disconnect(ride_uid, socket)


@dataclass(frozen=True)
class VehicleSubscription:
    websocket: WebSocket
    center_lat: float
    center_lng: float
    radius_km: float
    role_filter: str


class VehicleStreamHub:
    def __init__(self) -> None:
        self._subscriptions: set[VehicleSubscription] = set()
        self._lock = asyncio.Lock()

    async def connect(
        self,
        websocket: WebSocket,
        *,
        center_lat: float,
        center_lng: float,
        radius_km: float,
        role_filter: str = "all",
    ) -> VehicleSubscription:
        await websocket.accept()
        subscription = VehicleSubscription(
            websocket=websocket,
            center_lat=center_lat,
            center_lng=center_lng,
            radius_km=radius_km,
            role_filter=role_filter,
        )

        async with self._lock:
            self._subscriptions.add(subscription)

        return subscription

    async def disconnect(self, subscription: VehicleSubscription) -> None:
        async with self._lock:
            self._subscriptions.discard(subscription)

    async def broadcast_vehicle(self, vehicle_payload: dict[str, object]) -> None:
        lat = float(vehicle_payload.get("lat", 0.0))
        lng = float(vehicle_payload.get("lng", 0.0))
        vehicle_role = str(vehicle_payload.get("role", "")).strip().lower()

        async with self._lock:
            subscriptions = list(self._subscriptions)

        for subscription in subscriptions:
            if subscription.role_filter != "all" and vehicle_role != subscription.role_filter:
                continue

            distance = haversine_km(
                subscription.center_lat,
                subscription.center_lng,
                lat,
                lng,
            )
            if distance > subscription.radius_km:
                continue

            payload = {
                "type": "vehicle_update",
                "vehicle": vehicle_payload,
            }

            try:
                await subscription.websocket.send_json(payload)
            except Exception:
                await self.disconnect(subscription)


ride_chat_hub = RideSocketHub()
ride_lobby_hub = RideSocketHub()
ride_tracking_hub = RideSocketHub()
vehicle_stream_hub = VehicleStreamHub()