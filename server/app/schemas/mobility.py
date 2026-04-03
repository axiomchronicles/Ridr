from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator

RoleType = Literal["driver", "rider"]
RideStatusType = Literal[
    "pending_acceptance",
    "accepted",
    "cancelled",
    "in_progress",
    "completed",
    "matched",
]


class Coordinate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class VehicleInput(BaseModel):
    seats_available: int | None = Field(default=None, ge=0, le=12)
    fuel_efficiency: float | None = Field(default=None, gt=0)
    vehicle_name: str | None = Field(default=None, max_length=120)


class PreferenceInput(BaseModel):
    gender: str | None = Field(default=None, max_length=40)
    smoking: bool | None = None
    music: bool | None = None
    interests: list[str] | None = None

    @field_validator("interests")
    @classmethod
    def normalize_interests(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None

        cleaned = [item.strip().lower() for item in value if item and item.strip()]
        return cleaned or None


class CommuteInput(BaseModel):
    origin: Coordinate
    destination: Coordinate

    departure_time: int = Field(
        ge=0,
        le=1439,
        validation_alias=AliasChoices("departure_time", "departureTime"),
    )
    flexibility: int = Field(ge=0, le=240)

    days: list[int] = Field(min_length=1)
    role: RoleType

    vehicle: VehicleInput | None = None
    preferences: PreferenceInput | None = None

    origin_label: str | None = Field(default=None, max_length=255)
    destination_label: str | None = Field(default=None, max_length=255)

    @field_validator("days")
    @classmethod
    def normalize_days(cls, value: list[int]) -> list[int]:
        normalized = sorted(set(day for day in value if 1 <= day <= 7))
        if not normalized:
            raise ValueError("days must include values between 1 and 7")
        return normalized


class CommuteUpsertRequest(BaseModel):
    commute: CommuteInput


class CommuteUpsertResponse(BaseModel):
    user_id: int
    updated: bool
    role: RoleType


class MatchRequest(BaseModel):
    commute: CommuteInput
    max_candidates: int = Field(default=10, ge=1, le=50)
    radius_km: float = Field(default=8.0, gt=0, le=50)


class MatchScoreBreakdown(BaseModel):
    route: float
    time: float
    role: float
    preference: float
    total: float


class MatchCandidate(BaseModel):
    user_id: int
    role: RoleType
    score: float
    breakdown: MatchScoreBreakdown
    origin_distance_km: float
    destination_distance_km: float
    reasons: list[str]
    shared_interests: int = 0


class MatchResponse(BaseModel):
    matches: list[MatchCandidate]
    message: str | None = None


class RideBookingRequest(BaseModel):
    commute: CommuteInput
    selected_user_id: int | None = None
    max_candidates: int = Field(default=10, ge=1, le=50)
    radius_km: float = Field(default=8.0, gt=0, le=50)


class RideBookingResponse(BaseModel):
    ride_id: str
    status: str
    booking_session_state: Literal["created", "existing"]
    booking_session_message: str
    matched_user_id: int
    matched_user_name: str
    matched_role: RoleType
    score: float
    reasons: list[str]
    breakdown: MatchScoreBreakdown


class RideBookingSessionStateResponse(BaseModel):
    has_active_session: bool
    ride_id: str | None = None
    ride_status: RideStatusType | None = None
    matched_user_name: str | None = None
    pickup_label: str | None = None
    destination_label: str | None = None
    score: float | None = None
    message: str


class RideSummary(BaseModel):
    ride_id: str
    status: RideStatusType
    rider_id: int | None
    driver_id: int | None
    matched_user_name: str | None = None
    matched_role: RoleType | None = None
    pickup: Coordinate
    destination: Coordinate
    pickup_label: str | None = None
    destination_label: str | None = None
    score: float
    reasons: list[str]
    updated_at: datetime
    transaction: "RideTransactionState"


class RideTransactionState(BaseModel):
    status: RideStatusType
    can_cancel: bool
    can_modify: bool
    can_accept: bool
    message: str
    estimated_accept_seconds: int | None = None


class RideTransactionUpdateRequest(BaseModel):
    action: Literal["cancel", "modify", "accept", "complete"]
    reason: str | None = Field(default=None, max_length=255)
    pickup: Coordinate | None = None
    destination: Coordinate | None = None
    pickup_label: str | None = Field(default=None, max_length=255)
    destination_label: str | None = Field(default=None, max_length=255)
    departure_time: int | None = Field(default=None, ge=0, le=1439)


class RideLobbyParticipant(BaseModel):
    user_id: int
    name: str
    role: RoleType
    ride_id: str
    ride_status: RideStatusType
    distance_km: float
    vehicle_name: str | None = None
    lat: float
    lng: float
    is_current_user: bool


class RideLobbyMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class RideLobbyMessageRead(BaseModel):
    id: int
    ride_id: str | None
    rider_id: int
    cluster_key: str
    sender_id: int | None
    sender_role: str
    sender_name: str | None = None
    text: str
    created_at: datetime


class RideMeetingLobbySnapshot(BaseModel):
    ride_id: str
    cluster_key: str
    radius_km: float
    center: Coordinate
    participants: list[RideLobbyParticipant]
    messages: list[RideLobbyMessageRead]


class ChatMessageCreate(BaseModel):
    text: str = Field(min_length=1, max_length=1000)


class ChatMessageRead(BaseModel):
    id: int
    ride_id: str
    sender_id: int | None
    sender_role: str
    text: str
    created_at: datetime


class VehicleTrackingUpdate(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    heading: float | None = Field(default=None, ge=0, le=360)
    speed_kph: float | None = Field(default=None, ge=0, le=300)
    status: str = Field(default="available", max_length=24)


class VehicleMarker(BaseModel):
    user_id: int
    ride_id: str | None
    lat: float
    lng: float
    heading: float | None
    speed_kph: float | None
    status: str
    role: RoleType
    vehicle_name: str | None = None
    distance_km: float
    updated_at: datetime


class NearbyVehiclesResponse(BaseModel):
    vehicles: list[VehicleMarker]


class VehicleStreamEnvelope(BaseModel):
    type: Literal["vehicle_update"] = "vehicle_update"
    vehicle: VehicleMarker


class ChatStreamEnvelope(BaseModel):
    type: Literal["chat_message"] = "chat_message"
    message: ChatMessageRead


class TrackingStreamEnvelope(BaseModel):
    type: Literal["tracking_update"] = "tracking_update"
    vehicle: VehicleMarker


class SocketAck(BaseModel):
    type: Literal["ack"] = "ack"
    message: str


class SocketError(BaseModel):
    type: Literal["error"] = "error"
    message: str

    model_config = ConfigDict(extra="ignore")