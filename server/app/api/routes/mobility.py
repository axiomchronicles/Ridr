from __future__ import annotations

import asyncio
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from math import cos, radians, sin
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from pydantic import ValidationError
from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import decode_access_token
from app.db.seed_mobility import seed_mobility_data
from app.db.session import SessionLocal, get_db
from app.models.mobility import CommuteProfile, RideBookingSession, RideChatMessage, RideLobbyMessage, RideMatch, VehicleLocation
from app.models.user import User
from app.schemas.mobility import (
    ChatMessageCreate,
    ChatMessageRead,
    CommuteInput,
    CommuteUpsertRequest,
    CommuteUpsertResponse,
    FareEstimateBreakdown,
    FareEstimateRequest,
    FareEstimateResponse,
    FareTierType,
    MatchCandidate,
    MatchRequest,
    MatchResponse,
    MatchScoreBreakdown,
    MyRideItem,
    MyRidesResponse,
    NearbyVehiclesResponse,
    RideBookingRequest,
    RideBookingResponse,
    RideBookingSessionStateResponse,
    RideCostSplit,
    RideLobbyMessageCreate,
    RideLobbyMessageRead,
    RideLobbyParticipant,
    RideMeetingLobbySnapshot,
    SustainabilityAchievement,
    SustainabilityDashboardResponse,
    SustainabilityKpi,
    SustainabilityLeaderboardEntry,
    SustainabilityProjection,
    SustainabilityRideHistoryItem,
    SustainabilityTrendPoint,
    RideSummary,
    RideTransactionState,
    RideTransactionUpdateRequest,
    VehicleMarker,
    VehicleTrackingUpdate,
)
from app.services.matching import compute_match_score, haversine_km
from app.services.realtime import ride_chat_hub, ride_lobby_hub, ride_tracking_hub, vehicle_stream_hub

router = APIRouter(prefix="/mobility", tags=["mobility"])

AUTO_ACCEPT_DELAY_SECONDS = 18
MEETING_LOBBY_RADIUS_KM = 3.5
ACTIVE_RIDE_STATUSES = ("matched", "pending_acceptance", "accepted", "in_progress")
TERMINAL_RIDE_STATUSES = ("cancelled", "completed")
MESSAGE_ENABLED_RIDE_STATUSES = ("accepted", "in_progress")
BASELINE_CO2_KG_PER_KM = 0.192
DEFAULT_ICE_CO2_KG_PER_KM = 0.167
EV_CO2_KG_PER_KM = 0.055
CO2_KG_PER_LITER_PETROL = 2.31
KG_TO_LBS = 2.20462
KM_TO_MILES = 0.621371
TREE_ABSORPTION_KG_PER_YEAR = 37.5
BASELINE_USD_PER_KM = 20.5
SHARED_USD_PER_KM = 14.2
BASELINE_USD_BASE = 48.0
SHARED_USD_BASE = 35.0

FARE_CURRENCY = "INR"
FARE_BASE_BY_TIER: dict[FareTierType, float] = {
    "standard": 68.0,
    "eco": 58.0,
    "carpool": 46.0,
}
FARE_DISTANCE_RATE_BY_TIER: dict[FareTierType, float] = {
    "standard": 18.5,
    "eco": 15.8,
    "carpool": 13.2,
}
FARE_TIME_RATE_BY_TIER: dict[FareTierType, float] = {
    "standard": 3.6,
    "eco": 3.0,
    "carpool": 2.5,
}
FARE_MINIMUM_BY_TIER: dict[FareTierType, float] = {
    "standard": 120.0,
    "eco": 98.0,
    "carpool": 82.0,
}
FARE_SERVICE_MULTIPLIER_BY_TIER: dict[FareTierType, float] = {
    "standard": 1.0,
    "eco": 0.94,
    "carpool": 0.86,
}
FARE_BOOKING_FEE_INR = 14.0
FARE_OPERATING_FEE_INR = 11.0
FARE_AIRPORT_SURCHARGE_INR = 55.0
FARE_LONG_PICKUP_FREE_KM = 1.5
FARE_LONG_PICKUP_PER_KM_INR = 3.9
FARE_ESTIMATED_SPEED_KMH = 29.0

PEAK_HOURS = {7, 8, 9, 17, 18, 19, 20}
LATE_NIGHT_HOURS = {22, 23, 0, 1, 2, 3, 4, 5}
SUSTAINABILITY_GOAL_USD = 30000.0
DRIVER_MAX_ACTIVE_RIDERS = 3


def _as_utc(timestamp: datetime | None) -> datetime:
    if timestamp is None:
        return datetime.now(timezone.utc)

    if timestamp.tzinfo is None:
        return timestamp.replace(tzinfo=timezone.utc)

    return timestamp.astimezone(timezone.utc)


def _append_system_message(db: Session, ride_id: int, text: str) -> None:
    db.add(
        RideChatMessage(
            ride_id=ride_id,
            sender_id=None,
            sender_role="system",
            body=text,
        )
    )


def _build_transaction_state(ride: RideMatch, current_user: User) -> RideTransactionState:
    status = ride.status
    is_rider = current_user.id == ride.rider_id
    is_driver = current_user.id == ride.driver_id

    can_cancel = status in {"matched", "pending_acceptance", "accepted"} and (is_rider or is_driver)
    can_modify = status in {"matched", "pending_acceptance"} and is_rider
    can_accept = status in {"matched", "pending_acceptance"} and is_driver

    if status == "matched":
        now_utc = datetime.now(timezone.utc)
        created_at = _as_utc(ride.created_at)
        elapsed_seconds = max(0, int((now_utc - created_at).total_seconds()))
        remaining_seconds = max(0, AUTO_ACCEPT_DELAY_SECONDS - elapsed_seconds)
        message = "Ride matched. Confirm, modify, or cancel this request."
        return RideTransactionState(
            status="matched",
            can_cancel=can_cancel,
            can_modify=can_modify,
            can_accept=can_accept,
            message=message,
            estimated_accept_seconds=remaining_seconds,
        )

    if status == "pending_acceptance":
        now_utc = datetime.now(timezone.utc)
        created_at = _as_utc(ride.created_at)
        elapsed_seconds = max(0, int((now_utc - created_at).total_seconds()))
        remaining_seconds = max(0, AUTO_ACCEPT_DELAY_SECONDS - elapsed_seconds)
        message = "Driver reviewing request. You can modify or cancel while waiting."
        return RideTransactionState(
            status="pending_acceptance",
            can_cancel=can_cancel,
            can_modify=can_modify,
            can_accept=can_accept,
            message=message,
            estimated_accept_seconds=remaining_seconds,
        )

    if status == "accepted":
        return RideTransactionState(
            status="accepted",
            can_cancel=can_cancel,
            can_modify=False,
            can_accept=False,
            message="Ride accepted. Continue to pre-ride coordination.",
        )

    if status == "cancelled":
        return RideTransactionState(
            status="cancelled",
            can_cancel=False,
            can_modify=False,
            can_accept=False,
            message="Ride request cancelled.",
        )

    if status == "in_progress":
        return RideTransactionState(
            status="in_progress",
            can_cancel=False,
            can_modify=False,
            can_accept=False,
            message="Ride is in progress.",
        )

    if status == "completed":
        return RideTransactionState(
            status="completed",
            can_cancel=False,
            can_modify=False,
            can_accept=False,
            message="Ride completed.",
        )

    return RideTransactionState(
        status="matched",
        can_cancel=can_cancel,
        can_modify=can_modify,
        can_accept=can_accept,
        message="Ride transaction initialized.",
    )


def _maybe_auto_accept_ride(db: Session, ride: RideMatch) -> bool:
    if ride.status not in {"matched", "pending_acceptance"} or ride.driver_id is None:
        return False

    active_other_rides = _active_driver_rider_count(
        db,
        driver_id=ride.driver_id,
        exclude_ride_id=ride.id,
    )
    if active_other_rides >= DRIVER_MAX_ACTIVE_RIDERS:
        ride.status = "cancelled"
        _append_system_message(
            db,
            ride.id,
            "Ride auto-cancelled because assigned driver reached active rider capacity.",
        )
        return True

    created_at = _as_utc(ride.created_at)
    elapsed_seconds = int((datetime.now(timezone.utc) - created_at).total_seconds())
    if elapsed_seconds < AUTO_ACCEPT_DELAY_SECONDS:
        return False

    ride.status = "accepted"
    _append_system_message(db, ride.id, "Driver accepted the ride request.")
    return True


def _active_driver_rider_count(
    db: Session,
    *,
    driver_id: int,
    exclude_ride_id: int | None = None,
) -> int:
    query = select(func.count(RideMatch.id)).where(
        RideMatch.driver_id == driver_id,
        RideMatch.status.in_(ACTIVE_RIDE_STATUSES),
        RideMatch.rider_id.is_not(None),
    )

    if exclude_ride_id is not None:
        query = query.where(RideMatch.id != exclude_ride_id)

    return int(db.scalar(query) or 0)


def _active_driver_rider_loads(
    db: Session,
    driver_ids: set[int],
) -> dict[int, int]:
    if not driver_ids:
        return {}

    rows = db.execute(
        select(RideMatch.driver_id, func.count(RideMatch.id))
        .where(
            RideMatch.driver_id.in_(driver_ids),
            RideMatch.status.in_(ACTIVE_RIDE_STATUSES),
            RideMatch.rider_id.is_not(None),
        )
        .group_by(RideMatch.driver_id)
    ).all()

    return {
        int(driver_id): int(count)
        for driver_id, count in rows
        if driver_id is not None
    }


def _traffic_multiplier_for_hour(hour: int) -> float:
    normalized_hour = hour % 24
    if normalized_hour in PEAK_HOURS:
        return 1.22
    if normalized_hour in LATE_NIGHT_HOURS:
        return 0.93
    if 10 <= normalized_hour <= 15:
        return 0.98
    return 1.07


def _demand_multiplier_for_hour(hour: int, active_supply_load: int) -> float:
    normalized_hour = hour % 24
    base_multiplier = 1.0

    if normalized_hour in PEAK_HOURS:
        base_multiplier += 0.18
    elif normalized_hour in LATE_NIGHT_HOURS:
        base_multiplier += 0.1

    load_boost = min(0.24, max(0, active_supply_load - 1) * 0.06)
    return max(1.0, min(1.75, base_multiplier + load_boost))


def _estimate_duration_minutes(distance_km: float, departure_time: int) -> int:
    hour = (departure_time // 60) % 24
    traffic_multiplier = _traffic_multiplier_for_hour(hour)
    duration = ((distance_km / FARE_ESTIMATED_SPEED_KMH) * 60.0 * traffic_multiplier) + 2.0
    return max(5, int(round(duration)))


def _has_location_surcharge(label: str | None) -> bool:
    if not label:
        return False

    normalized = label.strip().lower()
    if not normalized:
        return False

    surcharge_keywords = (
        "airport",
        "terminal",
        "railway station",
        "metro hub",
        "bus terminal",
    )
    return any(keyword in normalized for keyword in surcharge_keywords)


def _normalize_interest_tokens(raw_interests: list[str] | None) -> set[str]:
    if not raw_interests:
        return set()

    normalized: set[str] = set()
    for item in raw_interests:
        token = str(item).strip().lower()
        if token:
            normalized.add(token)
    return normalized


def _resolve_fare_tier(
    *,
    interest_tokens: set[str],
    is_ev: bool,
    party_size: int,
) -> FareTierType:
    if party_size >= 2:
        return "carpool"

    explicit_standard = {"standard", "tier:standard", "ride_tier:standard"}
    explicit_eco = {"eco", "ev", "tier:eco", "ride_tier:eco"}
    explicit_carpool = {"carpool", "pool", "tier:carpool", "ride_tier:carpool"}

    if interest_tokens.intersection(explicit_carpool):
        return "carpool"
    if interest_tokens.intersection(explicit_standard):
        return "standard"
    if interest_tokens.intersection(explicit_eco):
        return "eco"

    return "eco" if is_ev else "standard"


def _estimate_fare(
    *,
    distance_km: float,
    departure_time: int,
    ride_tier: FareTierType,
    party_size: int,
    active_supply_load: int,
    pickup_reposition_km: float,
    pickup_label: str | None,
    destination_label: str | None,
    duration_minutes: float | None = None,
) -> FareEstimateResponse:
    normalized_distance_km = max(0.6, distance_km)
    normalized_party_size = max(1, party_size)

    estimated_duration_minutes = (
        max(1, int(round(duration_minutes)))
        if duration_minutes is not None
        else _estimate_duration_minutes(normalized_distance_km, departure_time)
    )

    base_fare = FARE_BASE_BY_TIER[ride_tier]
    distance_charge = normalized_distance_km * FARE_DISTANCE_RATE_BY_TIER[ride_tier]
    time_charge = estimated_duration_minutes * FARE_TIME_RATE_BY_TIER[ride_tier]

    service_multiplier = FARE_SERVICE_MULTIPLIER_BY_TIER[ride_tier]
    hour = (departure_time // 60) % 24
    demand_multiplier = _demand_multiplier_for_hour(hour, active_supply_load)
    traffic_multiplier = _traffic_multiplier_for_hour(hour)
    traffic_adjustment = 1.0 + ((traffic_multiplier - 1.0) * 0.35)

    subtotal_before_multiplier = base_fare + distance_charge + time_charge
    subtotal_after_multiplier = (
        subtotal_before_multiplier * service_multiplier * demand_multiplier * traffic_adjustment
    )

    pickup_surcharge = max(0.0, pickup_reposition_km - FARE_LONG_PICKUP_FREE_KM) * FARE_LONG_PICKUP_PER_KM_INR
    location_surcharge = 0.0
    if _has_location_surcharge(pickup_label) or _has_location_surcharge(destination_label):
        location_surcharge = FARE_AIRPORT_SURCHARGE_INR

    minimum_fare = FARE_MINIMUM_BY_TIER[ride_tier]
    preliminary_total = (
        subtotal_after_multiplier
        + FARE_BOOKING_FEE_INR
        + FARE_OPERATING_FEE_INR
        + pickup_surcharge
        + location_surcharge
    )
    minimum_fare_applied = preliminary_total < minimum_fare
    estimated_total = max(minimum_fare, preliminary_total)
    estimated_per_rider = estimated_total / normalized_party_size

    assumptions = [
        "Includes base fare, distance, and travel-time components.",
        "Applies real-time demand and traffic multipliers by departure window.",
        "Includes booking/operating fees and location surcharges where applicable.",
    ]

    return FareEstimateResponse(
        currency=FARE_CURRENCY,
        ride_tier=ride_tier,
        party_size=normalized_party_size,
        estimated_duration_minutes=estimated_duration_minutes,
        estimated_total=round(estimated_total, 2),
        estimated_per_rider=round(estimated_per_rider, 2),
        assumptions=assumptions,
        breakdown=FareEstimateBreakdown(
            base_fare=round(base_fare, 2),
            distance_charge=round(distance_charge, 2),
            time_charge=round(time_charge, 2),
            booking_fee=round(FARE_BOOKING_FEE_INR, 2),
            operating_fee=round(FARE_OPERATING_FEE_INR, 2),
            pickup_surcharge=round(pickup_surcharge, 2),
            location_surcharge=round(location_surcharge, 2),
            service_multiplier=round(service_multiplier, 3),
            demand_multiplier=round(demand_multiplier, 3),
            traffic_multiplier=round(traffic_multiplier, 3),
            subtotal_before_multiplier=round(subtotal_before_multiplier, 2),
            subtotal_after_multiplier=round(subtotal_after_multiplier, 2),
            minimum_fare=round(minimum_fare, 2),
            minimum_fare_applied=minimum_fare_applied,
        ),
    )


def _estimate_ride_fare_for_match(
    db: Session,
    ride: RideMatch,
    *,
    party_size: int,
    active_supply_load: int,
) -> FareEstimateResponse:
    rider_commute = (
        db.scalar(select(CommuteProfile).where(CommuteProfile.id == ride.rider_commute_id))
        if ride.rider_commute_id is not None
        else None
    )
    driver_commute = (
        db.scalar(select(CommuteProfile).where(CommuteProfile.id == ride.driver_commute_id))
        if ride.driver_commute_id is not None
        else None
    )

    driver_vehicle_name = driver_commute.vehicle_name if driver_commute is not None else None
    interest_tokens = _normalize_interest_tokens(
        rider_commute.pref_interests if rider_commute is not None else None
    )

    ride_tier = _resolve_fare_tier(
        interest_tokens=interest_tokens,
        is_ev=_is_electric_vehicle_name(driver_vehicle_name),
        party_size=party_size,
    )

    pickup_reposition_km = 0.0
    if driver_commute is not None:
        pickup_reposition_km = max(
            0.0,
            haversine_km(
                driver_commute.origin_lat,
                driver_commute.origin_lng,
                ride.pickup_lat,
                ride.pickup_lng,
            ),
        )

    return _estimate_fare(
        distance_km=_ride_distance_km(ride),
        duration_minutes=None,
        departure_time=ride.departure_time,
        ride_tier=ride_tier,
        party_size=party_size,
        active_supply_load=active_supply_load,
        pickup_reposition_km=pickup_reposition_km,
        pickup_label=ride.pickup_label,
        destination_label=ride.destination_label,
    )


def _build_ride_cost_split(db: Session, ride: RideMatch) -> RideCostSplit:
    if ride.driver_id is None:
        party_size = 1
        active_driver_rides = 0
    else:
        active_driver_rides = _active_driver_rider_count(
            db,
            driver_id=ride.driver_id,
        )
        party_size = max(1, min(DRIVER_MAX_ACTIVE_RIDERS, active_driver_rides))

    fare_estimate = _estimate_ride_fare_for_match(
        db,
        ride,
        party_size=party_size,
        active_supply_load=active_driver_rides,
    )

    message = "Includes live demand, traffic, and operating fees."
    if fare_estimate.party_size > 1:
        message = (
            f"Cost is split across {fare_estimate.party_size} riders with dynamic "
            "traffic and demand adjustments."
        )

    return RideCostSplit(
        party_size=fare_estimate.party_size,
        total_fare_usd=round(fare_estimate.estimated_total, 2),
        your_share_usd=round(fare_estimate.estimated_per_rider, 2),
        currency=fare_estimate.currency,
        message=message,
    )


def _build_ride_summary(db: Session, ride: RideMatch, current_user: User) -> RideSummary:
    matched_user_id = ride.driver_id if current_user.id == ride.rider_id else ride.rider_id
    matched_user = (
        db.scalar(select(User).where(User.id == matched_user_id))
        if matched_user_id is not None
        else None
    )
    matched_user_name = (
        f"{matched_user.first_name} {matched_user.last_name}".strip()
        if matched_user is not None
        else None
    )
    matched_role = "driver" if current_user.id == ride.rider_id else "rider"

    return RideSummary(
        ride_id=ride.ride_uid,
        status=ride.status,
        rider_id=ride.rider_id,
        driver_id=ride.driver_id,
        matched_user_name=matched_user_name,
        matched_role=matched_role,  # type: ignore[arg-type]
        pickup={"lat": ride.pickup_lat, "lng": ride.pickup_lng},
        destination={"lat": ride.destination_lat, "lng": ride.destination_lng},
        pickup_label=ride.pickup_label,
        destination_label=ride.destination_label,
        score=ride.total_score,
        reasons=ride.score_reasons or [],
        cost_split=_build_ride_cost_split(db, ride),
        updated_at=_as_utc(ride.updated_at),
        transaction=_build_transaction_state(ride, current_user),
    )


def _build_booking_response_from_ride(
    db: Session,
    ride: RideMatch,
    current_user: User,
    *,
    booking_session_state: Literal["created", "existing"],
    booking_session_message: str,
) -> RideBookingResponse:
    matched_user_id = ride.driver_id if current_user.id == ride.rider_id else ride.rider_id
    if matched_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ride session has no matched counterpart",
        )

    matched_user = db.scalar(select(User).where(User.id == matched_user_id))
    if matched_user is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Matched user no longer available",
        )

    matched_user_name = f"{matched_user.first_name} {matched_user.last_name}".strip() or "Matched user"

    return RideBookingResponse(
        ride_id=ride.ride_uid,
        status=ride.status,
        booking_session_state=booking_session_state,
        booking_session_message=booking_session_message,
        matched_user_id=matched_user_id,
        matched_user_name=matched_user_name,
        matched_role="driver" if current_user.id == ride.rider_id else "rider",  # type: ignore[arg-type]
        score=ride.total_score,
        reasons=ride.score_reasons or ["Ride booking session is active."],
        breakdown=MatchScoreBreakdown(
            route=ride.route_score,
            time=ride.time_score,
            role=ride.role_score,
            preference=ride.preference_score,
            total=ride.total_score,
        ),
    )


def _resolve_active_ride_for_rider(db: Session, rider_id: int) -> RideMatch | None:
    return db.scalar(
        select(RideMatch)
        .where(
            RideMatch.rider_id == rider_id,
            RideMatch.status.in_(ACTIVE_RIDE_STATUSES),
        )
        .order_by(RideMatch.updated_at.desc(), RideMatch.created_at.desc())
    )


def _upsert_booking_session(
    db: Session,
    *,
    rider_id: int,
    ride: RideMatch,
) -> RideBookingSession:
    session_row = db.scalar(select(RideBookingSession).where(RideBookingSession.user_id == rider_id))
    now_utc = datetime.now(timezone.utc)

    if session_row is None:
        session_row = RideBookingSession(user_id=rider_id)
        db.add(session_row)

    if not session_row.is_active or session_row.ride_id != ride.id:
        session_row.started_at = now_utc

    session_row.ride_id = ride.id
    session_row.is_active = True
    session_row.ended_at = None
    session_row.closed_reason = None
    return session_row


def _close_booking_session(
    db: Session,
    *,
    rider_id: int | None,
    ride_id: int | None = None,
    reason: str,
) -> None:
    if rider_id is None:
        return

    session_row = db.scalar(select(RideBookingSession).where(RideBookingSession.user_id == rider_id))
    if session_row is None or not session_row.is_active:
        return

    if ride_id is not None and session_row.ride_id is not None and session_row.ride_id != ride_id:
        return

    session_row.is_active = False
    session_row.ended_at = datetime.now(timezone.utc)
    session_row.closed_reason = reason


def _sync_booking_session_for_ride(db: Session, ride: RideMatch) -> bool:
    if ride.rider_id is None:
        return False

    if ride.status in ACTIVE_RIDE_STATUSES:
        _upsert_booking_session(
            db,
            rider_id=ride.rider_id,
            ride=ride,
        )
        return True

    if ride.status in TERMINAL_RIDE_STATUSES:
        _close_booking_session(
            db,
            rider_id=ride.rider_id,
            ride_id=ride.id,
            reason=ride.status,
        )
        return True

    return False


def _resolve_active_ride_session_for_rider(db: Session, rider_id: int) -> RideMatch | None:
    active_ride = _resolve_active_ride_for_rider(db, rider_id)
    if active_ride is not None:
        _upsert_booking_session(
            db,
            rider_id=rider_id,
            ride=active_ride,
        )
        return active_ride

    _close_booking_session(
        db,
        rider_id=rider_id,
        reason="stale",
    )
    return None


def _is_electric_vehicle_name(vehicle_name: str | None) -> bool:
    if not vehicle_name:
        return False

    normalized_name = vehicle_name.lower()
    ev_keywords = ("ev", "electric", "tesla", "kona", "ioniq", "leaf", "byd", "zs")
    return any(keyword in normalized_name for keyword in ev_keywords)


def _ride_distance_km(ride: RideMatch) -> float:
    distance = haversine_km(
        ride.pickup_lat,
        ride.pickup_lng,
        ride.destination_lat,
        ride.destination_lng,
    )
    return max(0.6, distance)


def _ride_impact_weight(status_value: str) -> float:
    if status_value == "completed":
        return 1.0
    if status_value == "in_progress":
        return 0.85
    if status_value == "accepted":
        return 0.7
    if status_value in {"pending_acceptance", "matched"}:
        return 0.45
    return 0.0


def _route_label_from_ride(ride: RideMatch) -> str:
    pickup = (ride.pickup_label or "Pickup").strip() or "Pickup"
    destination = (ride.destination_label or "Destination").strip() or "Destination"
    return f"{pickup} to {destination}"


def _compute_ride_sustainability_metrics(
    ride: RideMatch,
    driver_commute: CommuteProfile | None,
    *,
    current_user_id: int,
) -> dict[str, object]:
    distance_km = _ride_distance_km(ride)
    occupancy = 2 if ride.rider_id is not None and ride.driver_id is not None else 1

    vehicle_name = driver_commute.vehicle_name if driver_commute is not None else None
    is_ev = _is_electric_vehicle_name(vehicle_name)

    if is_ev:
        actual_per_km = EV_CO2_KG_PER_KM
    elif driver_commute is not None and driver_commute.fuel_efficiency and driver_commute.fuel_efficiency > 0:
        actual_per_km = max(0.04, CO2_KG_PER_LITER_PETROL / float(driver_commute.fuel_efficiency))
    else:
        actual_per_km = DEFAULT_ICE_CO2_KG_PER_KM

    actual_per_passenger_km = actual_per_km / max(1, occupancy)

    baseline_co2_kg = BASELINE_CO2_KG_PER_KM * distance_km
    actual_co2_kg = actual_per_passenger_km * distance_km
    co2_saved_kg = max(0.0, baseline_co2_kg - actual_co2_kg)

    baseline_cost_usd = BASELINE_USD_BASE + (distance_km * BASELINE_USD_PER_KM)
    shared_rate_per_km = SHARED_USD_PER_KM * (0.92 if is_ev else 1.0)
    actual_cost_usd = SHARED_USD_BASE + (distance_km * shared_rate_per_km)
    if occupancy == 1:
        actual_cost_usd *= 0.94

    money_saved_usd = max(0.0, baseline_cost_usd - actual_cost_usd)

    role: Literal["rider", "driver"] = "rider" if current_user_id == ride.rider_id else "driver"

    return {
        "ride": ride,
        "distance_km": distance_km,
        "distance_miles": distance_km * KM_TO_MILES,
        "co2_saved_kg": co2_saved_kg,
        "co2_saved_lbs": co2_saved_kg * KG_TO_LBS,
        "money_saved_usd": money_saved_usd,
        "status": ride.status,
        "timestamp": _as_utc(ride.updated_at or ride.created_at),
        "route_label": _route_label_from_ride(ride),
        "role": role,
        "vehicle_name": vehicle_name,
        "is_ev": is_ev,
        "weight": _ride_impact_weight(ride.status),
    }


def _period_start_utc(value: datetime, mode: str) -> datetime:
    normalized = _as_utc(value)
    if mode == "weekly":
        start = normalized - timedelta(days=normalized.weekday())
        return start.replace(hour=0, minute=0, second=0, microsecond=0)

    return normalized.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def _build_trend_points(
    metrics: list[dict[str, object]],
    *,
    mode: str,
    periods: int,
    now_utc: datetime,
) -> list[SustainabilityTrendPoint]:
    bucket_totals: dict[datetime, dict[str, float]] = defaultdict(
        lambda: {"rides": 0.0, "co2": 0.0, "money": 0.0}
    )

    for item in metrics:
        timestamp = item.get("timestamp")
        if not isinstance(timestamp, datetime):
            continue

        bucket = _period_start_utc(timestamp, mode)
        bucket_totals[bucket]["rides"] += 1
        bucket_totals[bucket]["co2"] += float(item.get("co2_saved_lbs", 0.0))
        bucket_totals[bucket]["money"] += float(item.get("money_saved_usd", 0.0))

    if mode == "weekly":
        current_bucket = _period_start_utc(now_utc, "weekly")
        ordered_buckets = [
            current_bucket - timedelta(days=7 * index)
            for index in range(periods - 1, -1, -1)
        ]
    else:
        current_bucket = _period_start_utc(now_utc, "monthly")
        ordered_buckets: list[datetime] = []
        current_month_index = (current_bucket.year * 12) + (current_bucket.month - 1)
        for index in range(periods - 1, -1, -1):
            target_month_index = current_month_index - index
            target_year = target_month_index // 12
            target_month = (target_month_index % 12) + 1
            ordered_buckets.append(
                datetime(target_year, target_month, 1, tzinfo=timezone.utc)
            )

    trend_points: list[SustainabilityTrendPoint] = []
    for bucket in ordered_buckets:
        totals = bucket_totals.get(bucket, {"rides": 0.0, "co2": 0.0, "money": 0.0})
        label = bucket.strftime("%d %b") if mode == "weekly" else bucket.strftime("%b %Y")
        trend_points.append(
            SustainabilityTrendPoint(
                period_start=bucket,
                label=label,
                rides=int(totals["rides"]),
                co2_saved_lbs=round(totals["co2"], 2),
                money_saved_usd=round(totals["money"], 2),
            )
        )

    return trend_points


def _build_projection(
    *,
    years: int,
    monthly_co2_saved_lbs: float,
    monthly_money_saved_usd: float,
) -> SustainabilityProjection:
    projected_co2_saved_lbs = max(0.0, monthly_co2_saved_lbs * 12 * years)
    projected_money_saved_usd = max(0.0, monthly_money_saved_usd * 12 * years)
    projected_co2_kg = projected_co2_saved_lbs / KG_TO_LBS

    return SustainabilityProjection(
        years=years,
        projected_money_saved_usd=round(projected_money_saved_usd, 2),
        projected_co2_saved_lbs=round(projected_co2_saved_lbs, 2),
        projected_tree_equivalent=max(0, int(round(projected_co2_kg / TREE_ABSORPTION_KG_PER_YEAR))),
        goal_progress_percent=round(
            min(100.0, (projected_money_saved_usd / SUSTAINABILITY_GOAL_USD) * 100),
            1,
        ),
        annualized_co2_saved_lbs=round(monthly_co2_saved_lbs * 12, 2),
    )


def _leaderboard_badge(co2_saved_lbs: float) -> str:
    if co2_saved_lbs >= 2400:
        return "Elite Guardian"
    if co2_saved_lbs >= 1000:
        return "Carbon Saver"
    if co2_saved_lbs >= 500:
        return "Eco Commuter"
    return "Eco Newbie"


def _build_sustainability_dashboard(
    db: Session,
    current_user: User,
) -> SustainabilityDashboardResponse:
    now_utc = datetime.now(timezone.utc)

    rides_for_user = db.scalars(
        select(RideMatch)
        .where(
            or_(
                RideMatch.rider_id == current_user.id,
                RideMatch.driver_id == current_user.id,
            ),
            RideMatch.status != "cancelled",
        )
        .order_by(RideMatch.updated_at.desc(), RideMatch.created_at.desc())
    ).all()

    driver_commute_ids = {
        ride.driver_commute_id
        for ride in rides_for_user
        if ride.driver_commute_id is not None
    }
    commutes_by_id = {
        commute.id: commute
        for commute in db.scalars(
            select(CommuteProfile).where(CommuteProfile.id.in_(driver_commute_ids))
        ).all()
    }

    metrics = [
        _compute_ride_sustainability_metrics(
            ride,
            commutes_by_id.get(ride.driver_commute_id) if ride.driver_commute_id is not None else None,
            current_user_id=current_user.id,
        )
        for ride in rides_for_user
    ]

    weighted_distance_km = sum(
        float(item["distance_km"]) * float(item["weight"])
        for item in metrics
    )
    weighted_co2_saved_kg = sum(
        float(item["co2_saved_kg"]) * float(item["weight"])
        for item in metrics
    )
    weighted_money_saved_usd = sum(
        float(item["money_saved_usd"]) * float(item["weight"])
        for item in metrics
    )

    total_rides = len(rides_for_user)
    completed_rides = sum(1 for ride in rides_for_user if ride.status == "completed")
    active_rides = sum(1 for ride in rides_for_user if ride.status in ACTIVE_RIDE_STATUSES)

    co2_saved_lbs = weighted_co2_saved_kg * KG_TO_LBS
    avg_co2_saved_lbs = co2_saved_lbs / max(1, total_rides)

    valid_timestamps = [
        item.get("timestamp")
        for item in metrics
        if isinstance(item.get("timestamp"), datetime)
    ]
    if valid_timestamps:
        oldest_timestamp = min(valid_timestamps)
        days_span = max(30, (_as_utc(now_utc) - _as_utc(oldest_timestamp)).days + 1)
    else:
        days_span = 30

    monthly_factor = 30.0 / max(1, days_span)
    monthly_co2_saved_lbs = co2_saved_lbs * monthly_factor
    monthly_money_saved_usd = weighted_money_saved_usd * monthly_factor

    forecast_7y = _build_projection(
        years=7,
        monthly_co2_saved_lbs=monthly_co2_saved_lbs,
        monthly_money_saved_usd=monthly_money_saved_usd,
    )
    impact_30y = _build_projection(
        years=30,
        monthly_co2_saved_lbs=monthly_co2_saved_lbs,
        monthly_money_saved_usd=monthly_money_saved_usd,
    )

    ev_completed_rides = sum(
        1
        for item in metrics
        if item.get("status") == "completed" and bool(item.get("is_ev"))
    )

    achievements = [
        SustainabilityAchievement(
            key="carbon_saver",
            title="Carbon Saver",
            description="Prevented 100 lbs of CO2",
            unlocked=co2_saved_lbs >= 100,
            progress_percent=round(min(100.0, (co2_saved_lbs / 100) * 100), 1),
        ),
        SustainabilityAchievement(
            key="eco_commuter",
            title="Eco Commuter",
            description="Complete 10 electric rides",
            unlocked=ev_completed_rides >= 10,
            progress_percent=round(min(100.0, (ev_completed_rides / 10) * 100), 1),
        ),
        SustainabilityAchievement(
            key="forest_guardian",
            title="Forest Guardian",
            description="Prevent 500 lbs of CO2",
            unlocked=co2_saved_lbs >= 500,
            progress_percent=round(min(100.0, (co2_saved_lbs / 500) * 100), 1),
        ),
    ]

    recent_history: list[SustainabilityRideHistoryItem] = []
    for item in metrics[:6]:
        ride_obj = item.get("ride")
        if not isinstance(ride_obj, RideMatch):
            continue

        timestamp = item.get("timestamp")
        if not isinstance(timestamp, datetime):
            timestamp = now_utc

        role = item.get("role", "rider")
        if role not in {"rider", "driver"}:
            role = "rider"

        recent_history.append(
            SustainabilityRideHistoryItem(
                ride_id=ride_obj.ride_uid,
                date=timestamp,
                route_label=str(item.get("route_label") or "Route"),
                distance_miles=round(float(item.get("distance_miles", 0.0)), 2),
                money_saved_usd=round(float(item.get("money_saved_usd", 0.0)), 2),
                co2_saved_lbs=round(float(item.get("co2_saved_lbs", 0.0)), 2),
                role=role,  # type: ignore[arg-type]
                status=ride_obj.status,  # type: ignore[arg-type]
                vehicle_name=str(item.get("vehicle_name")) if item.get("vehicle_name") else None,
            )
        )

    history_weekly = _build_trend_points(
        metrics,
        mode="weekly",
        periods=8,
        now_utc=now_utc,
    )
    history_monthly = _build_trend_points(
        metrics,
        mode="monthly",
        periods=6,
        now_utc=now_utc,
    )

    rides_for_leaderboard = db.scalars(
        select(RideMatch)
        .where(RideMatch.status != "cancelled")
        .order_by(RideMatch.updated_at.desc(), RideMatch.created_at.desc())
    ).all()

    leaderboard_commute_ids = {
        ride.driver_commute_id
        for ride in rides_for_leaderboard
        if ride.driver_commute_id is not None
    }
    leaderboard_commutes = {
        commute.id: commute
        for commute in db.scalars(
            select(CommuteProfile).where(CommuteProfile.id.in_(leaderboard_commute_ids))
        ).all()
    }

    leaderboard_totals_lbs: dict[int, float] = defaultdict(float)
    for ride in rides_for_leaderboard:
        ride_metrics = _compute_ride_sustainability_metrics(
            ride,
            leaderboard_commutes.get(ride.driver_commute_id) if ride.driver_commute_id is not None else None,
            current_user_id=current_user.id,
        )
        weighted_saved_lbs = float(ride_metrics["co2_saved_lbs"]) * float(ride_metrics["weight"])

        unique_participants = {ride.rider_id, ride.driver_id}
        for participant_id in unique_participants:
            if participant_id is None:
                continue
            leaderboard_totals_lbs[participant_id] += weighted_saved_lbs

    leaderboard_user_ids = set(leaderboard_totals_lbs.keys())
    leaderboard_user_ids.add(current_user.id)
    users_for_leaderboard = {
        user.id: user
        for user in db.scalars(select(User).where(User.id.in_(leaderboard_user_ids))).all()
    }

    sorted_leaderboard = sorted(
        leaderboard_totals_lbs.items(),
        key=lambda item: item[1],
        reverse=True,
    )
    if current_user.id not in {user_id for user_id, _ in sorted_leaderboard}:
        sorted_leaderboard.append((current_user.id, 0.0))

    leaderboard: list[SustainabilityLeaderboardEntry] = []
    for rank, (user_id, saved_lbs) in enumerate(sorted_leaderboard[:12], start=1):
        leader = users_for_leaderboard.get(user_id)
        if leader is None:
            continue

        name = f"{leader.first_name} {leader.last_name}".strip() or "Ridr Member"
        leaderboard.append(
            SustainabilityLeaderboardEntry(
                rank=rank,
                user_id=user_id,
                name=name,
                city=leader.city,
                co2_saved_lbs=round(saved_lbs, 2),
                badge=_leaderboard_badge(saved_lbs),
                is_current_user=user_id == current_user.id,
            )
        )

    return SustainabilityDashboardResponse(
        as_of=now_utc,
        kpis=SustainabilityKpi(
            total_rides=total_rides,
            completed_rides=completed_rides,
            active_rides=active_rides,
            total_distance_km=round(weighted_distance_km, 2),
            total_distance_miles=round(weighted_distance_km * KM_TO_MILES, 2),
            co2_saved_kg=round(weighted_co2_saved_kg, 2),
            co2_saved_lbs=round(co2_saved_lbs, 2),
            estimated_trees=max(0, int(round(weighted_co2_saved_kg / TREE_ABSORPTION_KG_PER_YEAR))),
            money_saved_usd=round(weighted_money_saved_usd, 2),
            avg_co2_saved_lbs_per_ride=round(avg_co2_saved_lbs, 2),
        ),
        forecast_7y=forecast_7y,
        impact_30y=impact_30y,
        achievements=achievements,
        history_weekly=history_weekly,
        history_monthly=history_monthly,
        recent_history=recent_history,
        leaderboard=leaderboard,
    )


def _build_my_rides_response(
    db: Session,
    current_user: User,
) -> MyRidesResponse:
    now_utc = datetime.now(timezone.utc)

    rides_for_user = db.scalars(
        select(RideMatch)
        .where(
            or_(
                RideMatch.rider_id == current_user.id,
                RideMatch.driver_id == current_user.id,
            )
        )
        .order_by(RideMatch.updated_at.desc(), RideMatch.created_at.desc())
    ).all()

    matched_user_ids: set[int] = set()
    driver_commute_ids: set[int] = set()

    for ride in rides_for_user:
        matched_user_id = ride.driver_id if current_user.id == ride.rider_id else ride.rider_id
        if matched_user_id is not None:
            matched_user_ids.add(matched_user_id)

        if ride.driver_commute_id is not None:
            driver_commute_ids.add(ride.driver_commute_id)

    users_by_id = {
        user.id: user
        for user in db.scalars(select(User).where(User.id.in_(matched_user_ids))).all()
    }

    commutes_by_id = {
        commute.id: commute
        for commute in db.scalars(
            select(CommuteProfile).where(CommuteProfile.id.in_(driver_commute_ids))
        ).all()
    }

    ride_items: list[MyRideItem] = []
    total_distance_miles = 0.0
    total_co2_saved_lbs = 0.0
    total_money_saved_usd = 0.0

    for ride in rides_for_user:
        role: Literal["rider", "driver"] = "rider" if current_user.id == ride.rider_id else "driver"
        matched_user_id = ride.driver_id if role == "rider" else ride.rider_id
        matched_user = users_by_id.get(matched_user_id) if matched_user_id is not None else None
        matched_user_name = (
            f"{matched_user.first_name} {matched_user.last_name}".strip()
            if matched_user is not None
            else None
        )

        driver_commute = (
            commutes_by_id.get(ride.driver_commute_id)
            if ride.driver_commute_id is not None
            else None
        )

        sustainability_metrics = _compute_ride_sustainability_metrics(
            ride,
            driver_commute,
            current_user_id=current_user.id,
        )
        distance_miles = float(sustainability_metrics.get("distance_miles", 0.0))
        co2_saved_lbs = float(sustainability_metrics.get("co2_saved_lbs", 0.0))
        money_saved_usd = float(sustainability_metrics.get("money_saved_usd", 0.0))
        weight = float(sustainability_metrics.get("weight", 0.0))

        cost_split = _build_ride_cost_split(db, ride)

        total_distance_miles += distance_miles * weight
        total_co2_saved_lbs += co2_saved_lbs * weight
        total_money_saved_usd += money_saved_usd * weight

        ride_items.append(
            MyRideItem(
                ride_id=ride.ride_uid,
                status=ride.status,  # type: ignore[arg-type]
                role=role,  # type: ignore[arg-type]
                matched_user_name=matched_user_name,
                pickup_label=ride.pickup_label,
                destination_label=ride.destination_label,
                updated_at=_as_utc(ride.updated_at or ride.created_at),
                distance_miles=round(distance_miles, 2),
                total_fare_usd=round(cost_split.total_fare_usd, 2),
                your_share_usd=round(cost_split.your_share_usd, 2),
                split_party_size=cost_split.party_size,
                co2_saved_lbs=round(co2_saved_lbs, 2),
                money_saved_usd=round(money_saved_usd, 2),
                vehicle_name=driver_commute.vehicle_name if driver_commute is not None else None,
            )
        )

    active_rides = sum(1 for ride in rides_for_user if ride.status in ACTIVE_RIDE_STATUSES)
    completed_rides = sum(1 for ride in rides_for_user if ride.status == "completed")

    return MyRidesResponse(
        as_of=now_utc,
        total_rides=len(rides_for_user),
        active_rides=active_rides,
        completed_rides=completed_rides,
        total_distance_miles=round(total_distance_miles, 2),
        total_co2_saved_lbs=round(total_co2_saved_lbs, 2),
        total_money_saved_usd=round(total_money_saved_usd, 2),
        rides=ride_items,
    )


def _normalize_lobby_radius(radius_km: float) -> float:
    return max(0.5, min(radius_km, 20.0))


def _build_lobby_cluster_key(
    anchor_role: str,
    anchor_user_id: int,
    radius_km: float,
) -> str:
    return f"{anchor_role}:{anchor_user_id}:r:{int(round(radius_km * 10))}"


def _resolve_lobby_anchor_user(
    ride: RideMatch,
    current_user: User,
) -> tuple[str, int]:
    # In rider-first booking flow, driver is the shared anchor across many riders.
    if ride.driver_id is not None:
        return "driver", ride.driver_id

    if ride.rider_id is not None:
        return "rider", ride.rider_id

    return "user", current_user.id


def _format_user_name(user: User | None, fallback: str = "Unknown") -> str:
    if user is None:
        return fallback

    full_name = f"{user.first_name} {user.last_name}".strip()
    return full_name if full_name else fallback


def _lobby_message_to_read(
    message: RideLobbyMessage,
    users_by_id: dict[int, User],
    ride_uid_by_id: dict[int, str],
) -> RideLobbyMessageRead:
    sender_user = users_by_id.get(message.sender_id) if message.sender_id is not None else None
    sender_name = (
        _format_user_name(sender_user)
        if sender_user is not None
        else ("System" if message.sender_role == "system" else None)
    )

    return RideLobbyMessageRead(
        id=message.id,
        ride_id=ride_uid_by_id.get(message.ride_id) if message.ride_id is not None else None,
        rider_id=message.rider_id,
        cluster_key=message.cluster_key,
        sender_id=message.sender_id,
        sender_role=message.sender_role,
        sender_name=sender_name,
        text=message.body,
        created_at=message.created_at,
    )


def _resolve_lobby_rides(
    db: Session,
    ride: RideMatch,
    radius_km: float,
    *,
    anchor_role: str,
    anchor_user_id: int,
) -> list[RideMatch]:
    if anchor_role not in {"driver", "rider"}:
        return [ride]

    if anchor_role == "driver":
        anchor_clause = RideMatch.driver_id == anchor_user_id
    else:
        anchor_clause = RideMatch.rider_id == anchor_user_id

    candidate_rides = db.scalars(
        select(RideMatch).where(
            anchor_clause,
            RideMatch.status.in_(ACTIVE_RIDE_STATUSES),
        )
    ).all()

    lobby_rides = [
        candidate
        for candidate in candidate_rides
        if haversine_km(
            ride.pickup_lat,
            ride.pickup_lng,
            candidate.pickup_lat,
            candidate.pickup_lng,
        )
        <= radius_km
    ]

    if not any(candidate.id == ride.id for candidate in lobby_rides):
        lobby_rides.append(ride)

    lobby_rides.sort(key=lambda entry: _as_utc(entry.created_at))
    return lobby_rides


def _build_meeting_lobby_snapshot(
    db: Session,
    ride: RideMatch,
    current_user: User,
    *,
    radius_km: float,
) -> RideMeetingLobbySnapshot:
    normalized_radius = _normalize_lobby_radius(radius_km)
    anchor_role, anchor_user_id = _resolve_lobby_anchor_user(ride, current_user)
    lobby_rides = _resolve_lobby_rides(
        db,
        ride,
        normalized_radius,
        anchor_role=anchor_role,
        anchor_user_id=anchor_user_id,
    )

    center_lat = sum(entry.pickup_lat for entry in lobby_rides) / len(lobby_rides)
    center_lng = sum(entry.pickup_lng for entry in lobby_rides) / len(lobby_rides)

    cluster_key = _build_lobby_cluster_key(
        anchor_role,
        anchor_user_id,
        normalized_radius,
    )

    ride_uid_by_id = {entry.id: entry.ride_uid for entry in lobby_rides}

    user_ids: set[int] = set()
    commute_ids: set[int] = set()
    for entry in lobby_rides:
        if entry.rider_id is not None:
            user_ids.add(entry.rider_id)
        if entry.driver_id is not None:
            user_ids.add(entry.driver_id)
        if entry.rider_commute_id is not None:
            commute_ids.add(entry.rider_commute_id)
        if entry.driver_commute_id is not None:
            commute_ids.add(entry.driver_commute_id)

    users_by_id = {
        user.id: user
        for user in db.scalars(select(User).where(User.id.in_(user_ids))).all()
    }
    commutes_by_id = {
        commute.id: commute
        for commute in db.scalars(select(CommuteProfile).where(CommuteProfile.id.in_(commute_ids))).all()
    }

    participants: list[RideLobbyParticipant] = []
    seen_user_ids: set[int] = set()

    for entry in lobby_rides:
        if entry.rider_id is not None and entry.rider_id not in seen_user_ids:
            rider_user = users_by_id.get(entry.rider_id)
            rider_lat = entry.pickup_lat
            rider_lng = entry.pickup_lng
            participants.append(
                RideLobbyParticipant(
                    user_id=entry.rider_id,
                    name=_format_user_name(rider_user, "Rider"),
                    role="rider",
                    ride_id=entry.ride_uid,
                    ride_status=entry.status,
                    distance_km=round(
                        haversine_km(
                            ride.pickup_lat,
                            ride.pickup_lng,
                            rider_lat,
                            rider_lng,
                        ),
                        2,
                    ),
                    vehicle_name=None,
                    lat=rider_lat,
                    lng=rider_lng,
                    is_current_user=entry.rider_id == current_user.id,
                )
            )
            seen_user_ids.add(entry.rider_id)

        if entry.driver_id is not None and entry.driver_id not in seen_user_ids:
            driver_user = users_by_id.get(entry.driver_id)
            driver_commute = (
                commutes_by_id.get(entry.driver_commute_id)
                if entry.driver_commute_id is not None
                else None
            )
            driver_lat = driver_commute.origin_lat if driver_commute is not None else entry.pickup_lat
            driver_lng = driver_commute.origin_lng if driver_commute is not None else entry.pickup_lng
            participants.append(
                RideLobbyParticipant(
                    user_id=entry.driver_id,
                    name=_format_user_name(driver_user, "Driver"),
                    role="driver",
                    ride_id=entry.ride_uid,
                    ride_status=entry.status,
                    distance_km=round(
                        haversine_km(
                            ride.pickup_lat,
                            ride.pickup_lng,
                            driver_lat,
                            driver_lng,
                        ),
                        2,
                    ),
                    vehicle_name=driver_commute.vehicle_name if driver_commute is not None else None,
                    lat=driver_lat,
                    lng=driver_lng,
                    is_current_user=entry.driver_id == current_user.id,
                )
            )
            seen_user_ids.add(entry.driver_id)

    participants.sort(key=lambda item: (item.distance_km, item.role != "rider"))

    recent_messages = db.scalars(
        select(RideLobbyMessage)
        .where(RideLobbyMessage.cluster_key == cluster_key)
        .order_by(RideLobbyMessage.created_at.desc())
        .limit(120)
    ).all()
    recent_messages.reverse()

    messages = [
        _lobby_message_to_read(message, users_by_id, ride_uid_by_id)
        for message in recent_messages
    ]

    return RideMeetingLobbySnapshot(
        ride_id=ride.ride_uid,
        cluster_key=cluster_key,
        radius_km=normalized_radius,
        center={"lat": center_lat, "lng": center_lng},
        participants=participants,
        messages=messages,
    )


def _create_lobby_message(
    db: Session,
    *,
    ride: RideMatch,
    cluster_key: str,
    sender_id: int | None,
    sender_role: str,
    text: str,
) -> RideLobbyMessage:
    if ride.rider_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ride lobby is unavailable for this ride",
        )

    message = RideLobbyMessage(
        ride_id=ride.id,
        rider_id=ride.rider_id,
        cluster_key=cluster_key,
        sender_id=sender_id,
        sender_role=sender_role,
        body=text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return message


def _extract_token_from_websocket(websocket: WebSocket) -> str | None:
    token = websocket.query_params.get("token")
    if token:
        return token

    auth_header = websocket.headers.get("authorization")
    if auth_header and auth_header.lower().startswith("bearer "):
        return auth_header.split(" ", 1)[1].strip()

    return None


def _resolve_user_from_token(db: Session, token: str | None) -> User:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    try:
        payload = decode_access_token(token)
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token") from exc

    subject = payload.get("sub")
    if not subject:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = db.scalar(select(User).where(User.email == subject))
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    return user


def _upsert_commute_profile(
    db: Session,
    user_id: int,
    commute: CommuteInput,
) -> tuple[CommuteProfile, bool]:
    profile = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == user_id))
    updated = profile is not None

    if profile is None:
        profile = CommuteProfile(user_id=user_id)
        db.add(profile)

    profile.origin_lat = commute.origin.lat
    profile.origin_lng = commute.origin.lng
    profile.destination_lat = commute.destination.lat
    profile.destination_lng = commute.destination.lng
    profile.origin_label = commute.origin_label
    profile.destination_label = commute.destination_label
    profile.departure_time = commute.departure_time
    profile.flexibility = commute.flexibility
    profile.days = commute.days
    profile.role = commute.role
    profile.is_active = True

    if commute.vehicle:
        profile.seats_available = commute.vehicle.seats_available
        profile.fuel_efficiency = commute.vehicle.fuel_efficiency
        profile.vehicle_name = commute.vehicle.vehicle_name
    else:
        profile.seats_available = None
        profile.fuel_efficiency = None
        profile.vehicle_name = None

    if commute.preferences:
        profile.pref_gender = commute.preferences.gender
        profile.pref_music = commute.preferences.music
        profile.pref_smoking = commute.preferences.smoking
        profile.pref_interests = commute.preferences.interests
    else:
        profile.pref_gender = None
        profile.pref_music = None
        profile.pref_smoking = None
        profile.pref_interests = None

    db.flush()
    return profile, updated


def _build_match_candidates(
    db: Session,
    requester_profile: CommuteProfile,
    *,
    max_candidates: int,
    radius_km: float,
) -> list[MatchCandidate]:
    candidates = db.scalars(
        select(CommuteProfile).where(
            CommuteProfile.user_id != requester_profile.user_id,
            CommuteProfile.is_active.is_(True),
        )
    ).all()

    scored: list[MatchCandidate] = []

    for candidate in candidates:
        score_result = compute_match_score(
            requester_profile,
            candidate,
            max_distance_km=radius_km,
        )
        if score_result is None:
            continue

        scored.append(
            MatchCandidate(
                user_id=score_result.user_id,
                role=score_result.role,  # type: ignore[arg-type]
                score=score_result.breakdown.total,
                breakdown=score_result.breakdown,
                origin_distance_km=score_result.origin_distance_km,
                destination_distance_km=score_result.destination_distance_km,
                reasons=score_result.reasons,
                shared_interests=score_result.shared_interests,
            )
        )

    if requester_profile.role == "rider":
        candidate_driver_ids = {
            candidate.user_id
            for candidate in scored
            if candidate.role == "driver"
        }
        driver_loads = _active_driver_rider_loads(db, candidate_driver_ids)
        scored = [
            candidate
            for candidate in scored
            if not (
                candidate.role == "driver"
                and driver_loads.get(candidate.user_id, 0) >= DRIVER_MAX_ACTIVE_RIDERS
            )
        ]

    scored.sort(key=lambda item: item.score, reverse=True)
    return scored[:max_candidates]


def _build_nearest_compatible_fallback(
    db: Session,
    requester_profile: CommuteProfile,
) -> MatchCandidate | None:
    target_role = "driver" if requester_profile.role == "rider" else "rider"

    candidates = db.scalars(
        select(CommuteProfile).where(
            CommuteProfile.user_id != requester_profile.user_id,
            CommuteProfile.is_active.is_(True),
            CommuteProfile.role == target_role,
        )
    ).all()

    nearest_candidate: CommuteProfile | None = None
    nearest_origin_distance = 0.0
    nearest_destination_distance = 0.0
    shortest_combined_distance: float | None = None

    driver_loads = (
        _active_driver_rider_loads(
            db,
            {
                candidate.user_id
                for candidate in candidates
            },
        )
        if target_role == "driver"
        else {}
    )

    for candidate in candidates:
        if target_role == "driver":
            if (candidate.seats_available or 0) <= 0:
                continue
            if driver_loads.get(candidate.user_id, 0) >= DRIVER_MAX_ACTIVE_RIDERS:
                continue

        origin_distance = haversine_km(
            requester_profile.origin_lat,
            requester_profile.origin_lng,
            candidate.origin_lat,
            candidate.origin_lng,
        )
        destination_distance = haversine_km(
            requester_profile.destination_lat,
            requester_profile.destination_lng,
            candidate.destination_lat,
            candidate.destination_lng,
        )
        combined_distance = origin_distance + destination_distance

        if shortest_combined_distance is None or combined_distance < shortest_combined_distance:
            shortest_combined_distance = combined_distance
            nearest_candidate = candidate
            nearest_origin_distance = origin_distance
            nearest_destination_distance = destination_distance

    if nearest_candidate is None:
        return None

    route_score = max(0.2, 1 - ((nearest_origin_distance + nearest_destination_distance) / 60))
    time_diff = abs(requester_profile.departure_time - nearest_candidate.departure_time)
    time_score = max(0.2, 1 - (time_diff / 240))
    role_score = 1.0
    preference_score = 0.0

    total_score = (
        (route_score * 0.4)
        + (time_score * 0.25)
        + (role_score * 0.2)
        + (preference_score * 0.15)
    )

    reasons = [
        "Expanded search radius to find nearest available match",
        f"Nearest route corridor ({nearest_origin_distance:.1f} km pickup distance)",
        "Compatible roles (Driver + Rider)",
    ]

    return MatchCandidate(
        user_id=nearest_candidate.user_id,
        role=nearest_candidate.role,
        score=round(total_score, 4),
        breakdown=MatchScoreBreakdown(
            route=round(route_score, 4),
            time=round(time_score, 4),
            role=round(role_score, 4),
            preference=round(preference_score, 4),
            total=round(total_score, 4),
        ),
        origin_distance_km=round(nearest_origin_distance, 2),
        destination_distance_km=round(nearest_destination_distance, 2),
        reasons=reasons,
        shared_interests=0,
    )


def _resolve_ride_for_user(db: Session, ride_uid: str, user_id: int) -> RideMatch:
    ride = db.scalar(select(RideMatch).where(RideMatch.ride_uid == ride_uid))
    if ride is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Ride not found")

    if ride.rider_id != user_id and ride.driver_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Ride access denied")

    return ride


def _assert_message_access(ride: RideMatch) -> None:
    if ride.status not in MESSAGE_ENABLED_RIDE_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Messaging is available only after ride acceptance.",
        )


def _chat_message_to_read(message: RideChatMessage, ride_uid: str) -> ChatMessageRead:
    return ChatMessageRead(
        id=message.id,
        ride_id=ride_uid,
        sender_id=message.sender_id,
        sender_role=message.sender_role,
        text=message.body,
        created_at=message.created_at,
    )


def _vehicle_marker_from_row(
    location: VehicleLocation,
    role: str,
    vehicle_name: str | None,
    *,
    reference_lat: float,
    reference_lng: float,
    ride_uid: str | None,
) -> VehicleMarker:
    distance_km = haversine_km(reference_lat, reference_lng, location.lat, location.lng)
    return VehicleMarker(
        user_id=location.user_id,
        ride_id=ride_uid,
        lat=location.lat,
        lng=location.lng,
        heading=location.heading,
        speed_kph=location.speed_kph,
        status=location.status,
        role=role,  # type: ignore[arg-type]
        vehicle_name=vehicle_name,
        distance_km=round(distance_km, 2),
        updated_at=location.recorded_at,
    )


def _latest_vehicle_markers(
    db: Session,
    *,
    center_lat: float,
    center_lng: float,
    radius_km: float,
    role_filter: str = "all",
) -> list[VehicleMarker]:
    latest_location_subquery = (
        select(
            VehicleLocation.user_id,
            func.max(VehicleLocation.recorded_at).label("latest_recorded_at"),
        )
        .group_by(VehicleLocation.user_id)
        .subquery()
    )

    locations = db.scalars(
        select(VehicleLocation)
        .join(
            latest_location_subquery,
            and_(
                VehicleLocation.user_id == latest_location_subquery.c.user_id,
                VehicleLocation.recorded_at == latest_location_subquery.c.latest_recorded_at,
            ),
        )
        .where(VehicleLocation.status != "offline")
    ).all()

    if not locations:
        return []

    user_ids = [row.user_id for row in locations]
    profiles = {
        profile.user_id: profile
        for profile in db.scalars(
            select(CommuteProfile).where(CommuteProfile.user_id.in_(user_ids))
        ).all()
    }
    rides = {ride.id: ride.ride_uid for ride in db.scalars(select(RideMatch)).all()}

    markers: list[VehicleMarker] = []
    for row in locations:
        profile = profiles.get(row.user_id)
        role = profile.role if profile else "driver"
        if role_filter != "all" and role != role_filter:
            continue

        marker = _vehicle_marker_from_row(
            row,
            role=role,
            vehicle_name=profile.vehicle_name if profile else None,
            reference_lat=center_lat,
            reference_lng=center_lng,
            ride_uid=rides.get(row.ride_id),
        )
        if marker.distance_km <= radius_km:
            markers.append(marker)

    markers.sort(key=lambda item: item.distance_km)
    return markers[:50]


def _simulate_vehicle_marker_step(
    marker: VehicleMarker,
    *,
    center_lat: float,
    center_lng: float,
) -> VehicleMarker:
    heading = marker.heading if marker.heading is not None else 90.0
    speed_kph = marker.speed_kph if marker.speed_kph is not None else 22.0
    step_km = max(0.008, min((speed_kph / 3600) * 4, 0.05))

    delta_lat = (step_km / 111.0) * cos(radians(heading))
    lng_divisor = max(0.25, 111.0 * cos(radians(marker.lat)))
    delta_lng = (step_km / lng_divisor) * sin(radians(heading))

    next_lat = marker.lat + delta_lat
    next_lng = marker.lng + delta_lng
    next_heading = (heading + 7) % 360
    next_distance = haversine_km(center_lat, center_lng, next_lat, next_lng)

    return marker.model_copy(
        update={
            "lat": round(next_lat, 7),
            "lng": round(next_lng, 7),
            "heading": round(next_heading, 2),
            "speed_kph": speed_kph,
            "distance_km": round(next_distance, 2),
            "updated_at": datetime.now(timezone.utc),
        }
    )


def _create_chat_message(
    db: Session,
    *,
    ride: RideMatch,
    sender_id: int | None,
    sender_role: str,
    text: str,
) -> ChatMessageRead:
    message = RideChatMessage(
        ride_id=ride.id,
        sender_id=sender_id,
        sender_role=sender_role,
        body=text,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _chat_message_to_read(message, ride.ride_uid)


@router.post("/commutes/upsert", response_model=CommuteUpsertResponse)
def upsert_commute(
    payload: CommuteUpsertRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CommuteUpsertResponse:
    profile, updated = _upsert_commute_profile(db, current_user.id, payload.commute)
    db.commit()
    return CommuteUpsertResponse(user_id=current_user.id, updated=updated, role=profile.role)


@router.post("/matches", response_model=MatchResponse)
def find_matches(
    payload: MatchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MatchResponse:
    requester_profile, _ = _upsert_commute_profile(db, current_user.id, payload.commute)
    matches = _build_match_candidates(
        db,
        requester_profile,
        max_candidates=payload.max_candidates,
        radius_km=payload.radius_km,
    )

    db.commit()

    if not matches:
        return MatchResponse(
            matches=[],
            message=(
                "No compatible users nearby. Try increasing radius, adjusting departure time, or flexibility."
            ),
        )

    return MatchResponse(matches=matches)


@router.post("/fare-estimate", response_model=FareEstimateResponse)
def estimate_fare(payload: FareEstimateRequest) -> FareEstimateResponse:
    party_size = payload.party_size
    if party_size is None:
        party_size = 2 if payload.ride_tier == "carpool" else 1

    return _estimate_fare(
        distance_km=payload.distance_km,
        duration_minutes=payload.duration_minutes,
        departure_time=payload.departure_time,
        ride_tier=payload.ride_tier,
        party_size=party_size,
        active_supply_load=payload.active_supply_load,
        pickup_reposition_km=payload.pickup_reposition_km,
        pickup_label=payload.pickup_label,
        destination_label=payload.destination_label,
    )


@router.post("/rides/book", response_model=RideBookingResponse)
def book_ride_match(
    payload: RideBookingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideBookingResponse:
    existing_ride = _resolve_active_ride_session_for_rider(db, current_user.id)
    if existing_ride is not None:
        db.commit()
        return _build_booking_response_from_ride(
            db,
            existing_ride,
            current_user,
            booking_session_state="existing",
            booking_session_message=(
                "You already have an ongoing ride session. Redirecting to your active ride."
            ),
        )

    requester_profile, _ = _upsert_commute_profile(db, current_user.id, payload.commute)
    matches = _build_match_candidates(
        db,
        requester_profile,
        max_candidates=payload.max_candidates,
        radius_km=payload.radius_km,
    )

    direct_matches = [match for match in matches if match.breakdown.role >= 1.0]

    if not direct_matches:
        expanded_matches = _build_match_candidates(
            db,
            requester_profile,
            max_candidates=max(payload.max_candidates, 20),
            radius_km=max(payload.radius_km * 3, 35),
        )
        direct_matches = [match for match in expanded_matches if match.breakdown.role >= 1.0]

    if not direct_matches:
        fallback_match = _build_nearest_compatible_fallback(db, requester_profile)
        if fallback_match is None:
            seed_mobility_data()
            db.expire_all()
            fallback_match = _build_nearest_compatible_fallback(db, requester_profile)

        if fallback_match is not None:
            direct_matches = [fallback_match]
        else:
            db.commit()
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=(
                    "No compatible driver-rider matches found nearby. "
                    "Try expanding radius or adjusting departure flexibility."
                ),
            )

    selected_match = direct_matches[0]
    if payload.selected_user_id is not None:
        explicit_match = next(
            (match for match in direct_matches if match.user_id == payload.selected_user_id),
            None,
        )
        if explicit_match is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Selected user is not part of top candidates",
            )
        selected_match = explicit_match

    partner_user = db.scalar(select(User).where(User.id == selected_match.user_id))
    partner_commute = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == selected_match.user_id))
    if partner_user is None or partner_commute is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Matched user no longer available")

    if requester_profile.role == "rider" and selected_match.role == "driver":
        rider_id = current_user.id
        driver_id = selected_match.user_id
        rider_commute_id = requester_profile.id
        driver_commute_id = partner_commute.id
        driver_origin_lat = partner_commute.origin_lat
        driver_origin_lng = partner_commute.origin_lng
    elif requester_profile.role == "driver" and selected_match.role == "rider":
        rider_id = selected_match.user_id
        driver_id = current_user.id
        rider_commute_id = partner_commute.id
        driver_commute_id = requester_profile.id
        driver_origin_lat = requester_profile.origin_lat
        driver_origin_lng = requester_profile.origin_lng
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role compatibility invalid for direct pairing",
        )

    active_driver_rides = _active_driver_rider_count(
        db,
        driver_id=driver_id,
    )
    if active_driver_rides >= DRIVER_MAX_ACTIVE_RIDERS:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Selected driver has reached the maximum active rider capacity "
                f"({DRIVER_MAX_ACTIVE_RIDERS})."
            ),
        )

    ride_uid = f"ride_{uuid.uuid4().hex[:12]}"
    ride = RideMatch(
        ride_uid=ride_uid,
        rider_id=rider_id,
        driver_id=driver_id,
        rider_commute_id=rider_commute_id,
        driver_commute_id=driver_commute_id,
        status="pending_acceptance",
        total_score=selected_match.breakdown.total,
        route_score=selected_match.breakdown.route,
        time_score=selected_match.breakdown.time,
        role_score=selected_match.breakdown.role,
        preference_score=selected_match.breakdown.preference,
        score_reasons=selected_match.reasons,
        pickup_lat=requester_profile.origin_lat,
        pickup_lng=requester_profile.origin_lng,
        destination_lat=requester_profile.destination_lat,
        destination_lng=requester_profile.destination_lng,
        pickup_label=requester_profile.origin_label,
        destination_label=requester_profile.destination_label,
        departure_time=requester_profile.departure_time,
    )
    db.add(ride)
    db.flush()

    _append_system_message(
        db,
        ride.id,
        f"Transaction created in pending acceptance state: {' | '.join(selected_match.reasons)}",
    )

    db.add(
        VehicleLocation(
            user_id=driver_id,
            ride_id=ride.id,
            lat=driver_origin_lat,
            lng=driver_origin_lng,
            heading=90.0,
            speed_kph=28.0,
            status="assigned",
            source="matching",
        )
    )

    db.add(
        VehicleLocation(
            user_id=rider_id,
            ride_id=ride.id,
            lat=requester_profile.origin_lat,
            lng=requester_profile.origin_lng,
            heading=0.0,
            speed_kph=0.0,
            status="waiting_pickup",
            source="matching",
        )
    )

    _upsert_booking_session(
        db,
        rider_id=rider_id,
        ride=ride,
    )

    db.commit()

    return _build_booking_response_from_ride(
        db,
        ride,
        current_user,
        booking_session_state="created",
        booking_session_message="Ride booking session created and locked until ride is cancelled or completed.",
    )


@router.get("/rides/booking-session", response_model=RideBookingSessionStateResponse)
def get_active_ride_booking_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideBookingSessionStateResponse:
    active_ride = _resolve_active_ride_session_for_rider(db, current_user.id)
    if active_ride is None:
        db.commit()
        return RideBookingSessionStateResponse(
            has_active_session=False,
            message="No active ride booking session.",
        )

    ride_summary = _build_ride_summary(db, active_ride, current_user)
    db.commit()
    return RideBookingSessionStateResponse(
        has_active_session=True,
        ride_id=ride_summary.ride_id,
        ride_status=ride_summary.status,
        matched_user_name=ride_summary.matched_user_name,
        pickup_label=ride_summary.pickup_label,
        destination_label=ride_summary.destination_label,
        score=ride_summary.score,
        message="Active ride booking session found.",
    )


@router.get("/rides/my-rides", response_model=MyRidesResponse)
def get_my_rides(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MyRidesResponse:
    return _build_my_rides_response(db, current_user)


@router.get("/sustainability/dashboard", response_model=SustainabilityDashboardResponse)
def get_sustainability_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SustainabilityDashboardResponse:
    return _build_sustainability_dashboard(db, current_user)


@router.get("/rides/{ride_uid}", response_model=RideSummary)
def get_ride_summary(
    ride_uid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideSummary:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    ride_status_changed = _maybe_auto_accept_ride(db, ride)
    session_changed = _sync_booking_session_for_ride(db, ride)
    if ride_status_changed or session_changed:
        db.commit()
        db.refresh(ride)

    return _build_ride_summary(db, ride, current_user)


@router.patch("/rides/{ride_uid}/transaction", response_model=RideSummary)
def update_ride_transaction(
    ride_uid: str,
    payload: RideTransactionUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideSummary:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)

    if payload.action == "cancel":
        if ride.status in {"cancelled", "completed"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ride transaction cannot be cancelled in its current state",
            )

        ride.status = "cancelled"
        reason = payload.reason.strip() if payload.reason else "No reason provided"
        actor = "rider" if current_user.id == ride.rider_id else "driver"
        _append_system_message(db, ride.id, f"Transaction cancelled by {actor}. Reason: {reason}")

    elif payload.action == "modify":
        if current_user.id != ride.rider_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only rider can modify transaction details while awaiting acceptance",
            )
        if ride.status not in {"matched", "pending_acceptance"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ride can only be modified while waiting for acceptance",
            )

        changed = False
        if payload.pickup is not None:
            ride.pickup_lat = payload.pickup.lat
            ride.pickup_lng = payload.pickup.lng
            changed = True

        if payload.destination is not None:
            ride.destination_lat = payload.destination.lat
            ride.destination_lng = payload.destination.lng
            changed = True

        if payload.pickup_label is not None:
            ride.pickup_label = payload.pickup_label
            changed = True

        if payload.destination_label is not None:
            ride.destination_label = payload.destination_label
            changed = True

        if payload.departure_time is not None:
            ride.departure_time = payload.departure_time
            changed = True

        if not changed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No transaction fields were provided for modification",
            )

        rider_commute = (
            db.scalar(select(CommuteProfile).where(CommuteProfile.id == ride.rider_commute_id))
            if ride.rider_commute_id is not None
            else None
        )
        driver_commute = (
            db.scalar(select(CommuteProfile).where(CommuteProfile.id == ride.driver_commute_id))
            if ride.driver_commute_id is not None
            else None
        )

        if rider_commute is not None:
            rider_commute.origin_lat = ride.pickup_lat
            rider_commute.origin_lng = ride.pickup_lng
            rider_commute.destination_lat = ride.destination_lat
            rider_commute.destination_lng = ride.destination_lng
            rider_commute.origin_label = ride.pickup_label
            rider_commute.destination_label = ride.destination_label
            rider_commute.departure_time = ride.departure_time

        if rider_commute is not None and driver_commute is not None:
            updated_score = compute_match_score(rider_commute, driver_commute, max_distance_km=50)
            if updated_score is not None:
                ride.total_score = updated_score.breakdown.total
                ride.route_score = updated_score.breakdown.route
                ride.time_score = updated_score.breakdown.time
                ride.role_score = updated_score.breakdown.role
                ride.preference_score = updated_score.breakdown.preference
                ride.score_reasons = updated_score.reasons

        _append_system_message(
            db,
            ride.id,
            "Rider modified transaction details. Driver review restarted.",
        )

    elif payload.action == "accept":
        if current_user.id != ride.driver_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only assigned driver can accept this transaction",
            )
        if ride.status not in {"matched", "pending_acceptance"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ride is not awaiting acceptance",
            )

        if ride.driver_id is not None:
            active_other_rides = _active_driver_rider_count(
                db,
                driver_id=ride.driver_id,
                exclude_ride_id=ride.id,
            )
            if active_other_rides >= DRIVER_MAX_ACTIVE_RIDERS:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Cannot accept ride because driver has reached maximum "
                        f"active rider capacity ({DRIVER_MAX_ACTIVE_RIDERS})."
                    ),
                )

        ride.status = "accepted"
        _append_system_message(db, ride.id, "Driver accepted the ride request.")

    elif payload.action == "complete":
        if ride.status not in {"accepted", "in_progress"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Only active rides can be completed",
            )

        actor = "rider" if current_user.id == ride.rider_id else "driver"
        ride.status = "completed"
        _append_system_message(db, ride.id, f"Ride marked as completed by {actor}.")

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported transaction action")

    _sync_booking_session_for_ride(db, ride)

    db.commit()
    db.refresh(ride)
    return _build_ride_summary(db, ride, current_user)


@router.get("/rides/{ride_uid}/chat/messages", response_model=list[ChatMessageRead])
def get_ride_chat_messages(
    ride_uid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[ChatMessageRead]:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    _assert_message_access(ride)
    messages = db.scalars(
        select(RideChatMessage)
        .where(RideChatMessage.ride_id == ride.id)
        .order_by(RideChatMessage.created_at.asc())
    ).all()

    return [_chat_message_to_read(message, ride_uid) for message in messages]


@router.post("/rides/{ride_uid}/chat/messages", response_model=ChatMessageRead)
async def post_ride_chat_message(
    ride_uid: str,
    payload: ChatMessageCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ChatMessageRead:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    _assert_message_access(ride)
    sender_role = "driver" if ride.driver_id == current_user.id else "rider"
    message = _create_chat_message(
        db,
        ride=ride,
        sender_id=current_user.id,
        sender_role=sender_role,
        text=payload.text.strip(),
    )

    await ride_chat_hub.broadcast(
        ride_uid,
        {
            "type": "chat_message",
            "message": message.model_dump(mode="json"),
        },
    )

    return message


@router.get("/rides/{ride_uid}/meeting-lobby", response_model=RideMeetingLobbySnapshot)
def get_ride_meeting_lobby(
    ride_uid: str,
    radius_km: float = Query(default=MEETING_LOBBY_RADIUS_KM, gt=0, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideMeetingLobbySnapshot:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    _assert_message_access(ride)
    snapshot = _build_meeting_lobby_snapshot(
        db,
        ride,
        current_user,
        radius_km=radius_km,
    )

    if not any(participant.user_id == current_user.id for participant in snapshot.participants):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Meeting lobby access denied",
        )

    return snapshot


@router.post("/rides/{ride_uid}/meeting-lobby/messages", response_model=RideLobbyMessageRead)
async def post_ride_meeting_lobby_message(
    ride_uid: str,
    payload: RideLobbyMessageCreate,
    radius_km: float = Query(default=MEETING_LOBBY_RADIUS_KM, gt=0, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideLobbyMessageRead:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    _assert_message_access(ride)
    snapshot = _build_meeting_lobby_snapshot(
        db,
        ride,
        current_user,
        radius_km=radius_km,
    )

    if not any(participant.user_id == current_user.id for participant in snapshot.participants):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Meeting lobby access denied",
        )

    sender_role = "rider" if current_user.id == ride.rider_id else "driver"
    message_row = _create_lobby_message(
        db,
        ride=ride,
        cluster_key=snapshot.cluster_key,
        sender_id=current_user.id,
        sender_role=sender_role,
        text=payload.text.strip(),
    )

    message_read = _lobby_message_to_read(
        message_row,
        users_by_id={current_user.id: current_user},
        ride_uid_by_id={ride.id: ride.ride_uid},
    )

    await ride_lobby_hub.broadcast(
        snapshot.cluster_key,
        {
            "type": "lobby_message",
            "message": message_read.model_dump(mode="json"),
        },
    )

    return message_read


@router.post("/rides/{ride_uid}/tracking", response_model=VehicleMarker)
async def post_tracking_update(
    ride_uid: str,
    payload: VehicleTrackingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> VehicleMarker:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)

    profile = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == current_user.id))
    role = profile.role if profile else ("driver" if ride.driver_id == current_user.id else "rider")
    vehicle_name = profile.vehicle_name if profile else None

    location = VehicleLocation(
        user_id=current_user.id,
        ride_id=ride.id,
        lat=payload.lat,
        lng=payload.lng,
        heading=payload.heading,
        speed_kph=payload.speed_kph,
        status=payload.status,
        source="gps",
    )
    db.add(location)
    db.commit()
    db.refresh(location)

    marker = _vehicle_marker_from_row(
        location,
        role=role,
        vehicle_name=vehicle_name,
        reference_lat=ride.pickup_lat,
        reference_lng=ride.pickup_lng,
        ride_uid=ride.ride_uid,
    )

    marker_payload = marker.model_dump(mode="json")
    await ride_tracking_hub.broadcast(
        ride_uid,
        {
            "type": "tracking_update",
            "vehicle": marker_payload,
        },
    )
    await vehicle_stream_hub.broadcast_vehicle(marker_payload)

    return marker


@router.get("/vehicles/nearby", response_model=NearbyVehiclesResponse)
def get_nearby_vehicles(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(default=8.0, gt=0, le=50),
    role: str = Query(default="all", pattern="^(driver|rider|all)$"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> NearbyVehiclesResponse:
    return NearbyVehiclesResponse(
        vehicles=_latest_vehicle_markers(
            db,
            center_lat=lat,
            center_lng=lng,
            radius_km=radius_km,
            role_filter=role,
        )
    )


@router.websocket("/rides/{ride_uid}/chat/ws")
async def ride_chat_websocket(websocket: WebSocket, ride_uid: str) -> None:
    db = SessionLocal()
    try:
        user = _resolve_user_from_token(db, _extract_token_from_websocket(websocket))
        ride = _resolve_ride_for_user(db, ride_uid, user.id)
        _assert_message_access(ride)

        await ride_chat_hub.connect(ride_uid, websocket)
        await websocket.send_json({"type": "ack", "message": "Chat connected"})

        while True:
            payload = await websocket.receive_json()
            message_type = str(payload.get("type", "")).strip()
            if message_type != "chat_message":
                await websocket.send_json({"type": "error", "message": "Unsupported message type"})
                continue

            text = str(payload.get("text", "")).strip()
            if not text:
                await websocket.send_json({"type": "error", "message": "Message text is required"})
                continue

            sender_role = "driver" if ride.driver_id == user.id else "rider"
            message = _create_chat_message(
                db,
                ride=ride,
                sender_id=user.id,
                sender_role=sender_role,
                text=text,
            )

            await ride_chat_hub.broadcast(
                ride_uid,
                {
                    "type": "chat_message",
                    "message": message.model_dump(mode="json"),
                },
            )
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    except WebSocketDisconnect:
        pass
    finally:
        await ride_chat_hub.disconnect(ride_uid, websocket)
        db.close()


@router.websocket("/rides/{ride_uid}/meeting-lobby/ws")
async def ride_meeting_lobby_websocket(websocket: WebSocket, ride_uid: str) -> None:
    db = SessionLocal()
    cluster_key: str | None = None
    try:
        user = _resolve_user_from_token(db, _extract_token_from_websocket(websocket))
        ride = _resolve_ride_for_user(db, ride_uid, user.id)
        _assert_message_access(ride)

        try:
            radius_km = float(websocket.query_params.get("radius_km", str(MEETING_LOBBY_RADIUS_KM)))
        except (TypeError, ValueError):
            radius_km = MEETING_LOBBY_RADIUS_KM
        snapshot = _build_meeting_lobby_snapshot(
            db,
            ride,
            user,
            radius_km=radius_km,
        )

        if not any(participant.user_id == user.id for participant in snapshot.participants):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Meeting lobby access denied",
            )

        cluster_key = snapshot.cluster_key
        await ride_lobby_hub.connect(cluster_key, websocket)
        await websocket.send_json({"type": "ack", "message": "Meeting lobby connected"})
        await websocket.send_json(
            {
                "type": "lobby_snapshot",
                "snapshot": snapshot.model_dump(mode="json"),
            }
        )

        while True:
            payload = await websocket.receive_json()
            message_type = str(payload.get("type", "")).strip()
            if message_type != "lobby_message":
                await websocket.send_json({"type": "error", "message": "Unsupported message type"})
                continue

            text = str(payload.get("text", "")).strip()
            if not text:
                await websocket.send_json({"type": "error", "message": "Message text is required"})
                continue

            sender_role = "rider" if user.id == ride.rider_id else "driver"
            message_row = _create_lobby_message(
                db,
                ride=ride,
                cluster_key=cluster_key,
                sender_id=user.id,
                sender_role=sender_role,
                text=text,
            )

            message_read = _lobby_message_to_read(
                message_row,
                users_by_id={user.id: user},
                ride_uid_by_id={ride.id: ride.ride_uid},
            )

            await ride_lobby_hub.broadcast(
                cluster_key,
                {
                    "type": "lobby_message",
                    "message": message_read.model_dump(mode="json"),
                },
            )
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    except WebSocketDisconnect:
        pass
    finally:
        if cluster_key is not None:
            await ride_lobby_hub.disconnect(cluster_key, websocket)
        db.close()


@router.websocket("/rides/{ride_uid}/tracking/ws")
async def ride_tracking_websocket(websocket: WebSocket, ride_uid: str) -> None:
    db = SessionLocal()
    try:
        user = _resolve_user_from_token(db, _extract_token_from_websocket(websocket))
        ride = _resolve_ride_for_user(db, ride_uid, user.id)

        await ride_tracking_hub.connect(ride_uid, websocket)
        await websocket.send_json({"type": "ack", "message": "Tracking connected"})

        latest_location = db.scalar(
            select(VehicleLocation)
            .where(VehicleLocation.ride_id == ride.id)
            .order_by(VehicleLocation.recorded_at.desc())
        )
        if latest_location is not None:
            profile = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == latest_location.user_id))
            role = profile.role if profile else "driver"
            marker = _vehicle_marker_from_row(
                latest_location,
                role=role,
                vehicle_name=profile.vehicle_name if profile else None,
                reference_lat=ride.pickup_lat,
                reference_lng=ride.pickup_lng,
                ride_uid=ride.ride_uid,
            )
            await websocket.send_json({"type": "tracking_update", "vehicle": marker.model_dump(mode="json")})

        while True:
            payload = await websocket.receive_json()
            if str(payload.get("type", "")).strip() != "tracking_update":
                await websocket.send_json({"type": "error", "message": "Unsupported message type"})
                continue

            try:
                update = VehicleTrackingUpdate.model_validate(payload.get("payload") or payload)
            except ValidationError:
                await websocket.send_json({"type": "error", "message": "Invalid tracking payload"})
                continue

            profile = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == user.id))
            role = profile.role if profile else ("driver" if ride.driver_id == user.id else "rider")
            vehicle_name = profile.vehicle_name if profile else None

            location = VehicleLocation(
                user_id=user.id,
                ride_id=ride.id,
                lat=update.lat,
                lng=update.lng,
                heading=update.heading,
                speed_kph=update.speed_kph,
                status=update.status,
                source="gps",
            )
            db.add(location)
            db.commit()
            db.refresh(location)

            marker = _vehicle_marker_from_row(
                location,
                role=role,
                vehicle_name=vehicle_name,
                reference_lat=ride.pickup_lat,
                reference_lng=ride.pickup_lng,
                ride_uid=ride.ride_uid,
            )
            marker_payload = marker.model_dump(mode="json")

            await ride_tracking_hub.broadcast(
                ride_uid,
                {"type": "tracking_update", "vehicle": marker_payload},
            )
            await vehicle_stream_hub.broadcast_vehicle(marker_payload)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
    except WebSocketDisconnect:
        pass
    finally:
        await ride_tracking_hub.disconnect(ride_uid, websocket)
        db.close()


@router.websocket("/vehicles/stream/ws")
async def nearby_vehicles_websocket(websocket: WebSocket) -> None:
    db = SessionLocal()
    subscription = None
    try:
        _resolve_user_from_token(db, _extract_token_from_websocket(websocket))

        lat = float(websocket.query_params.get("lat", "0"))
        lng = float(websocket.query_params.get("lng", "0"))
        radius_km = float(websocket.query_params.get("radius_km", "8"))
        requested_role = str(websocket.query_params.get("role", "all")).strip().lower()
        role_filter = requested_role if requested_role in {"driver", "rider", "all"} else "all"

        subscription = await vehicle_stream_hub.connect(
            websocket,
            center_lat=lat,
            center_lng=lng,
            radius_km=max(0.5, min(radius_km, 50.0)),
            role_filter=role_filter,
        )
        await websocket.send_json({"type": "ack", "message": "Vehicle stream connected"})

        initial_markers = _latest_vehicle_markers(
            db,
            center_lat=lat,
            center_lng=lng,
            radius_km=radius_km,
            role_filter=role_filter,
        )
        simulated_markers = {marker.user_id: marker for marker in initial_markers}

        for marker in initial_markers:
            await websocket.send_json(
                {
                    "type": "vehicle_update",
                    "vehicle": marker.model_dump(mode="json"),
                }
            )

        while True:
            try:
                await asyncio.wait_for(websocket.receive_text(), timeout=4.0)
            except TimeoutError:
                next_markers: dict[int, VehicleMarker] = {}
                for user_id, marker in simulated_markers.items():
                    moved_marker = _simulate_vehicle_marker_step(
                        marker,
                        center_lat=lat,
                        center_lng=lng,
                    )
                    if moved_marker.distance_km > radius_km:
                        continue

                    next_markers[user_id] = moved_marker
                    await websocket.send_json(
                        {
                            "type": "vehicle_update",
                            "vehicle": moved_marker.model_dump(mode="json"),
                        }
                    )

                simulated_markers = next_markers
    except WebSocketDisconnect:
        pass
    except Exception:
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    finally:
        if subscription is not None:
            await vehicle_stream_hub.disconnect(subscription)
        db.close()