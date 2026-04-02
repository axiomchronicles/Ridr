from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from math import cos, radians, sin

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect, status
from jose import JWTError
from pydantic import ValidationError
from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import decode_access_token
from app.db.seed_mobility import seed_mobility_data
from app.db.session import SessionLocal, get_db
from app.models.mobility import CommuteProfile, RideChatMessage, RideMatch, VehicleLocation
from app.models.user import User
from app.schemas.mobility import (
    ChatMessageCreate,
    ChatMessageRead,
    CommuteInput,
    CommuteUpsertRequest,
    CommuteUpsertResponse,
    MatchCandidate,
    MatchRequest,
    MatchResponse,
    MatchScoreBreakdown,
    NearbyVehiclesResponse,
    RideBookingRequest,
    RideBookingResponse,
    RideSummary,
    RideTransactionState,
    RideTransactionUpdateRequest,
    VehicleMarker,
    VehicleTrackingUpdate,
)
from app.services.matching import compute_match_score, haversine_km
from app.services.realtime import ride_chat_hub, ride_tracking_hub, vehicle_stream_hub

router = APIRouter(prefix="/mobility", tags=["mobility"])

AUTO_ACCEPT_DELAY_SECONDS = 18


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

    can_cancel = status in {"pending_acceptance", "accepted"} and (is_rider or is_driver)
    can_modify = status == "pending_acceptance" and is_rider
    can_accept = status == "pending_acceptance" and is_driver

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
    if ride.status != "pending_acceptance" or ride.driver_id is None:
        return False

    created_at = _as_utc(ride.created_at)
    elapsed_seconds = int((datetime.now(timezone.utc) - created_at).total_seconds())
    if elapsed_seconds < AUTO_ACCEPT_DELAY_SECONDS:
        return False

    ride.status = "accepted"
    _append_system_message(db, ride.id, "Driver accepted the ride request.")
    return True


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
        updated_at=_as_utc(ride.updated_at),
        transaction=_build_transaction_state(ride, current_user),
    )


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

    for candidate in candidates:
        if target_role == "driver" and (candidate.seats_available or 0) <= 0:
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


@router.post("/rides/book", response_model=RideBookingResponse)
def book_ride_match(
    payload: RideBookingRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideBookingResponse:
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

    db.commit()

    return RideBookingResponse(
        ride_id=ride_uid,
        status=ride.status,
        matched_user_id=partner_user.id,
        matched_user_name=f"{partner_user.first_name} {partner_user.last_name}".strip(),
        matched_role=selected_match.role,
        score=selected_match.score,
        reasons=selected_match.reasons,
        breakdown=selected_match.breakdown,
    )


@router.get("/rides/{ride_uid}", response_model=RideSummary)
def get_ride_summary(
    ride_uid: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RideSummary:
    ride = _resolve_ride_for_user(db, ride_uid, current_user.id)
    if _maybe_auto_accept_ride(db, ride):
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
                detail="Only rider can modify pending transaction details",
            )
        if ride.status != "pending_acceptance":
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
        if ride.status != "pending_acceptance":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Ride is not awaiting acceptance",
            )

        ride.status = "accepted"
        _append_system_message(db, ride.id, "Driver accepted the ride request.")

    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported transaction action")

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