from __future__ import annotations

from sqlalchemy import (
    JSON,
    Boolean,
    Column,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    func,
)

from app.db.base import Base


class CommuteProfile(Base):
    __tablename__ = "commute_profiles"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True, unique=True)

    origin_lat = Column(Float, nullable=False)
    origin_lng = Column(Float, nullable=False)
    destination_lat = Column(Float, nullable=False)
    destination_lng = Column(Float, nullable=False)
    origin_label = Column(String(255), nullable=True)
    destination_label = Column(String(255), nullable=True)

    departure_time = Column(Integer, nullable=False)
    flexibility = Column(Integer, nullable=False, default=15)
    days = Column(JSON, nullable=False, default=list)

    role = Column(String(16), nullable=False, index=True)
    seats_available = Column(Integer, nullable=True)
    fuel_efficiency = Column(Float, nullable=True)
    vehicle_name = Column(String(120), nullable=True)

    pref_gender = Column(String(40), nullable=True)
    pref_smoking = Column(Boolean, nullable=True)
    pref_music = Column(Boolean, nullable=True)
    pref_interests = Column(JSON, nullable=True)

    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RideMatch(Base):
    __tablename__ = "ride_matches"

    id = Column(Integer, primary_key=True, index=True)
    ride_uid = Column(String(40), unique=True, nullable=False, index=True)

    rider_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    driver_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)

    rider_commute_id = Column(Integer, ForeignKey("commute_profiles.id", ondelete="SET NULL"), nullable=True)
    driver_commute_id = Column(Integer, ForeignKey("commute_profiles.id", ondelete="SET NULL"), nullable=True)

    status = Column(String(24), nullable=False, default="matched", index=True)

    total_score = Column(Float, nullable=False, default=0.0)
    route_score = Column(Float, nullable=False, default=0.0)
    time_score = Column(Float, nullable=False, default=0.0)
    role_score = Column(Float, nullable=False, default=0.0)
    preference_score = Column(Float, nullable=False, default=0.0)

    score_reasons = Column(JSON, nullable=True)

    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    destination_lat = Column(Float, nullable=False)
    destination_lng = Column(Float, nullable=False)
    pickup_label = Column(String(255), nullable=True)
    destination_label = Column(String(255), nullable=True)

    departure_time = Column(Integer, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class RideChatMessage(Base):
    __tablename__ = "ride_chat_messages"

    id = Column(Integer, primary_key=True, index=True)
    ride_id = Column(Integer, ForeignKey("ride_matches.id", ondelete="CASCADE"), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    sender_role = Column(String(24), nullable=False, default="system")
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class VehicleLocation(Base):
    __tablename__ = "vehicle_locations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    ride_id = Column(Integer, ForeignKey("ride_matches.id", ondelete="SET NULL"), nullable=True, index=True)

    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    heading = Column(Float, nullable=True)
    speed_kph = Column(Float, nullable=True)

    status = Column(String(24), nullable=False, default="available", index=True)
    source = Column(String(24), nullable=False, default="gps")

    recorded_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class RideLobbyMessage(Base):
    __tablename__ = "ride_lobby_messages"

    id = Column(Integer, primary_key=True, index=True)
    ride_id = Column(Integer, ForeignKey("ride_matches.id", ondelete="SET NULL"), nullable=True, index=True)
    rider_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    cluster_key = Column(String(96), nullable=False, index=True)
    sender_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    sender_role = Column(String(24), nullable=False, default="system")
    body = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True)


class RideBookingSession(Base):
    __tablename__ = "ride_booking_sessions"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    ride_id = Column(Integer, ForeignKey("ride_matches.id", ondelete="SET NULL"), nullable=True, index=True)
    is_active = Column(Boolean, nullable=False, default=False, index=True)
    started_at = Column(DateTime(timezone=True), nullable=True)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    closed_reason = Column(String(64), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )