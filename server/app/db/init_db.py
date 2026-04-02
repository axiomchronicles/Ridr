from app.db.base import Base
from app.db.seed_mobility import seed_mobility_data
from app.db.session import engine
from app.models import CommuteProfile, RideChatMessage, RideMatch, User, VehicleLocation  # noqa: F401


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    seed_mobility_data()
