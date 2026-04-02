from __future__ import annotations

from dataclasses import dataclass
from math import asin, cos, radians, sin, sqrt

from app.models.mobility import CommuteProfile
from app.schemas.mobility import MatchScoreBreakdown

ROUTE_WEIGHT = 0.4
TIME_WEIGHT = 0.25
ROLE_WEIGHT = 0.2
PREFERENCE_WEIGHT = 0.15


@dataclass
class MatchScoreResult:
    user_id: int
    role: str
    origin_distance_km: float
    destination_distance_km: float
    shared_interests: int
    reasons: list[str]
    breakdown: MatchScoreBreakdown


def haversine_km(
    lat_a: float,
    lng_a: float,
    lat_b: float,
    lng_b: float,
) -> float:
    earth_radius_km = 6371.0

    lat1 = radians(lat_a)
    lng1 = radians(lng_a)
    lat2 = radians(lat_b)
    lng2 = radians(lng_b)

    delta_lat = lat2 - lat1
    delta_lng = lng2 - lng1

    arc = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lng / 2) ** 2
    )
    return 2 * earth_radius_km * asin(sqrt(arc))


def _normalize_days(days: object) -> set[int]:
    if not isinstance(days, list):
        return set()
    return {int(day) for day in days if isinstance(day, int) and 1 <= day <= 7}


def _normalize_interests(raw: object) -> set[str]:
    if not isinstance(raw, list):
        return set()
    return {str(item).strip().lower() for item in raw if str(item).strip()}


def _boolean_preference_score(
    requester_value: bool | None,
    candidate_value: bool | None,
) -> float:
    if requester_value is None or candidate_value is None:
        return 0.0
    return 0.25 if requester_value == candidate_value else 0.0


def _string_preference_score(
    requester_value: str | None,
    candidate_value: str | None,
) -> float:
    if not requester_value or not candidate_value:
        return 0.0

    if requester_value.strip().lower() == candidate_value.strip().lower():
        return 0.25

    return 0.0


def compute_role_score(
    requester: CommuteProfile,
    candidate: CommuteProfile,
) -> float:
    requester_role = requester.role
    candidate_role = candidate.role

    if requester_role == "rider" and candidate_role == "driver":
        candidate_seats = candidate.seats_available or 0
        return 1.0 if candidate_seats > 0 else 0.0

    if requester_role == "driver" and candidate_role == "rider":
        requester_seats = requester.seats_available or 0
        return 1.0 if requester_seats > 0 else 0.0

    if requester_role == "rider" and candidate_role == "rider":
        return 0.5

    if requester_role == "driver" and candidate_role == "driver":
        return 0.2

    return 0.0


def compute_match_score(
    requester: CommuteProfile,
    candidate: CommuteProfile,
    *,
    max_distance_km: float,
) -> MatchScoreResult | None:
    requester_days = _normalize_days(requester.days)
    candidate_days = _normalize_days(candidate.days)
    if not requester_days.intersection(candidate_days):
        return None

    origin_distance = haversine_km(
        requester.origin_lat,
        requester.origin_lng,
        candidate.origin_lat,
        candidate.origin_lng,
    )
    destination_distance = haversine_km(
        requester.destination_lat,
        requester.destination_lng,
        candidate.destination_lat,
        candidate.destination_lng,
    )

    if origin_distance > max_distance_km or destination_distance > max_distance_km:
        return None

    origin_score = max(0.0, 1 - (origin_distance / max_distance_km))
    destination_score = max(0.0, 1 - (destination_distance / max_distance_km))
    route_score = (origin_score + destination_score) / 2

    time_diff = abs(requester.departure_time - candidate.departure_time)
    max_window = requester.flexibility + candidate.flexibility

    if max_window <= 0:
        time_score = 1.0 if time_diff == 0 else 0.0
    else:
        time_score = max(0.0, 1 - (time_diff / max_window))

    role_score = compute_role_score(requester, candidate)
    if role_score == 0:
        return None

    preference_score = 0.0
    preference_score += _string_preference_score(requester.pref_gender, candidate.pref_gender)
    preference_score += _boolean_preference_score(requester.pref_smoking, candidate.pref_smoking)
    preference_score += _boolean_preference_score(requester.pref_music, candidate.pref_music)

    requester_interests = _normalize_interests(requester.pref_interests)
    candidate_interests = _normalize_interests(candidate.pref_interests)
    shared_interests = len(requester_interests.intersection(candidate_interests))
    if shared_interests > 0:
        preference_score += 0.25

    total_score = (
        (route_score * ROUTE_WEIGHT)
        + (time_score * TIME_WEIGHT)
        + (role_score * ROLE_WEIGHT)
        + (preference_score * PREFERENCE_WEIGHT)
    )

    reasons: list[str] = []
    route_percent = round(route_score * 100)
    if route_percent >= 85:
        reasons.append(f"Same route ({route_percent}% match)")
    elif route_percent >= 60:
        reasons.append(f"Nearby route ({route_percent}% match)")

    if time_diff <= 10:
        reasons.append("Leaves within 10 minutes")
    elif time_score > 0:
        reasons.append("Flexible timing overlap")

    if role_score == 1.0:
        reasons.append(
            "Compatible roles (Driver + Rider)"
            if requester.role != candidate.role
            else "Compatible pooling role"
        )
    elif role_score == 0.5:
        reasons.append("Rider pooling option")
    else:
        reasons.append("Limited role compatibility")

    if shared_interests > 0:
        reasons.append(f"{shared_interests} shared interests")

    if not reasons:
        reasons.append("General commute compatibility")

    return MatchScoreResult(
        user_id=candidate.user_id,
        role=candidate.role,
        origin_distance_km=round(origin_distance, 2),
        destination_distance_km=round(destination_distance, 2),
        shared_interests=shared_interests,
        reasons=reasons,
        breakdown=MatchScoreBreakdown(
            route=round(route_score, 4),
            time=round(time_score, 4),
            role=round(role_score, 4),
            preference=round(preference_score, 4),
            total=round(total_score, 4),
        ),
    )