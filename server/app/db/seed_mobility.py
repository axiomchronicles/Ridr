from __future__ import annotations

from sqlalchemy import func, select

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.mobility import CommuteProfile, VehicleLocation
from app.models.user import User

DEMO_PASSWORD = "RidrDemo123!"

DEMO_USERS: list[dict[str, object]] = [
    {
        "email": "driver.maya@ridr.demo",
        "first_name": "Maya",
        "last_name": "Sharma",
        "city": "Faridabad",
        "role": "driver",
        "origin": (28.6185, 77.2055),
        "destination": (28.6328, 77.2195),
        "departure_time": 490,
        "flexibility": 18,
        "days": [1, 2, 3, 4, 5],
        "seats": 3,
        "fuel_efficiency": 17.8,
        "vehicle_name": "Tesla Model 3",
        "interests": ["music", "tech", "running"],
    },
    {
        "email": "driver.arjun@ridr.demo",
        "first_name": "Arjun",
        "last_name": "Rao",
        "city": "Delhi",
        "role": "driver",
        "origin": (28.6119, 77.2133),
        "destination": (28.6291, 77.2174),
        "departure_time": 500,
        "flexibility": 15,
        "days": [1, 2, 3, 4, 5],
        "seats": 2,
        "fuel_efficiency": 18.9,
        "vehicle_name": "BYD e6",
        "interests": ["podcasts", "coding", "cycling"],
    },
    {
        "email": "driver.nisha@ridr.demo",
        "first_name": "Nisha",
        "last_name": "Kapoor",
        "city": "Gurugram",
        "role": "driver",
        "origin": (28.6213, 77.2141),
        "destination": (28.6358, 77.2264),
        "departure_time": 475,
        "flexibility": 20,
        "days": [1, 2, 3, 4, 5],
        "seats": 1,
        "fuel_efficiency": 16.3,
        "vehicle_name": "Nexon EV",
        "interests": ["music", "travel", "fitness"],
    },
    {
        "email": "driver.rohan@ridr.demo",
        "first_name": "Rohan",
        "last_name": "Khanna",
        "city": "Delhi",
        "role": "driver",
        "origin": (28.6078, 77.2012),
        "destination": (28.6266, 77.2159),
        "departure_time": 510,
        "flexibility": 12,
        "days": [1, 2, 3, 4, 5, 6],
        "seats": 4,
        "fuel_efficiency": 19.2,
        "vehicle_name": "MG ZS EV",
        "interests": ["gaming", "coffee", "tech"],
    },
    {
        "email": "driver.sana@ridr.demo",
        "first_name": "Sana",
        "last_name": "Iqbal",
        "city": "Noida",
        "role": "driver",
        "origin": (28.6247, 77.2298),
        "destination": (28.6399, 77.2362),
        "departure_time": 520,
        "flexibility": 22,
        "days": [1, 2, 3, 4, 5],
        "seats": 2,
        "fuel_efficiency": 20.4,
        "vehicle_name": "Hyundai Kona Electric",
        "interests": ["reading", "music", "yoga"],
    },
    {
        "email": "rider.isha@ridr.demo",
        "first_name": "Isha",
        "last_name": "Batra",
        "city": "Delhi",
        "role": "rider",
        "origin": (28.6153, 77.2078),
        "destination": (28.6317, 77.2212),
        "departure_time": 495,
        "flexibility": 15,
        "days": [1, 2, 3, 4, 5],
        "seats": None,
        "fuel_efficiency": None,
        "vehicle_name": None,
        "interests": ["music", "travel", "movies"],
    },
    {
        "email": "rider.karan@ridr.demo",
        "first_name": "Karan",
        "last_name": "Mehta",
        "city": "Delhi",
        "role": "rider",
        "origin": (28.6202, 77.2166),
        "destination": (28.6361, 77.2262),
        "departure_time": 505,
        "flexibility": 12,
        "days": [1, 2, 3, 4, 5],
        "seats": None,
        "fuel_efficiency": None,
        "vehicle_name": None,
        "interests": ["sports", "music", "startup"],
    },
    {
        "email": "rider.zoe@ridr.demo",
        "first_name": "Zoe",
        "last_name": "Fernandes",
        "city": "Noida",
        "role": "rider",
        "origin": (28.6274, 77.2304),
        "destination": (28.6417, 77.2383),
        "departure_time": 515,
        "flexibility": 18,
        "days": [1, 2, 3, 4, 5, 6],
        "seats": None,
        "fuel_efficiency": None,
        "vehicle_name": None,
        "interests": ["books", "travel", "art"],
    },
]


def _get_or_create_user(db, entry: dict[str, object]) -> User:
    email = str(entry["email"]).lower()
    user = db.scalar(select(User).where(User.email == email))
    if user:
        return user

    user = User(
        email=email,
        first_name=str(entry["first_name"]),
        last_name=str(entry["last_name"]),
        city=str(entry["city"]),
        hashed_password=hash_password(DEMO_PASSWORD),
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def seed_mobility_data() -> None:
    with SessionLocal() as db:
        existing_profiles = db.scalar(select(func.count(CommuteProfile.id))) or 0
        if existing_profiles >= len(DEMO_USERS):
            return

        for entry in DEMO_USERS:
            user = _get_or_create_user(db, entry)

            profile = db.scalar(select(CommuteProfile).where(CommuteProfile.user_id == user.id))
            if profile is None:
                origin_lat, origin_lng = entry["origin"]  # type: ignore[index]
                destination_lat, destination_lng = entry["destination"]  # type: ignore[index]

                profile = CommuteProfile(
                    user_id=user.id,
                    origin_lat=float(origin_lat),
                    origin_lng=float(origin_lng),
                    destination_lat=float(destination_lat),
                    destination_lng=float(destination_lng),
                    origin_label="Demo pickup",
                    destination_label="Demo destination",
                    departure_time=int(entry["departure_time"]),
                    flexibility=int(entry["flexibility"]),
                    days=entry["days"],
                    role=str(entry["role"]),
                    seats_available=entry["seats"],
                    fuel_efficiency=entry["fuel_efficiency"],
                    vehicle_name=entry["vehicle_name"],
                    pref_music=True,
                    pref_smoking=False,
                    pref_interests=entry["interests"],
                )
                db.add(profile)
                db.flush()

            latest_location = db.scalar(
                select(VehicleLocation)
                .where(VehicleLocation.user_id == user.id)
                .order_by(VehicleLocation.recorded_at.desc())
            )

            if latest_location is None:
                is_driver = profile.role == "driver"
                db.add(
                    VehicleLocation(
                        user_id=user.id,
                        ride_id=None,
                        lat=profile.origin_lat,
                        lng=profile.origin_lng,
                        heading=90.0 if is_driver else 0.0,
                        speed_kph=24.0 if is_driver else 2.5,
                        status="available" if is_driver else "active",
                        source="seed",
                    )
                )

        db.commit()