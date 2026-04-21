EcoRidr Backend (FastAPI)

A production-style FastAPI backend using SQLAlchemy and JWT authentication.

## Tech Stack

- FastAPI
- SQLAlchemy 2.x
- pwdlib (Argon2 password hashing)
- python-jose (JWT)
- Pydantic Settings (.env-driven configuration)

## Setup

1. Use the existing `env/` virtual environment inside `server/`.
2. Install dependencies into that environment:

```bash
env/bin/pip install -r requirements.txt
```

3. Configure environment variables (already scaffolded):

```bash
cp .env.example .env
```

4. Run the API from `server/`:

```bash
env/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir .
```

## Endpoints

- `GET /` - Root health
- `GET /api/v1/health` - API health
- `POST /api/v1/auth/register` - Register and receive JWT
- `POST /api/v1/auth/login` - Login and receive JWT
- `GET /api/v1/auth/me` - Get current user (requires Bearer token)
- `POST /api/v1/mobility/commutes/upsert` - Upsert user commute profile
- `POST /api/v1/mobility/matches` - Ranked commute matches with explainability
- `POST /api/v1/mobility/rides/book` - Create ride session or return existing active ride session for rider
- `GET /api/v1/mobility/rides/booking-session` - Fetch active ride booking session for current rider
- `GET /api/v1/mobility/rides/my-rides` - Aggregated rider/driver history with split fare and impact metrics
- `GET /api/v1/mobility/sustainability/dashboard` - Live sustainability analytics (CO2 saved, projections, trends, leaderboard)
- `GET /api/v1/mobility/rides/{ride_uid}` - Ride summary, transaction state, and action capabilities
- `PATCH /api/v1/mobility/rides/{ride_uid}/transaction` - Transaction actions: modify, cancel, accept, complete
- `GET /api/v1/mobility/rides/{ride_uid}/chat/messages` - Chat history for a ride
- `POST /api/v1/mobility/rides/{ride_uid}/chat/messages` - Send a chat message over HTTP
- `GET /api/v1/mobility/rides/{ride_uid}/meeting-lobby` - Users in same rider/radius coordination lobby
- `POST /api/v1/mobility/rides/{ride_uid}/meeting-lobby/messages` - Send lobby chat message
- `POST /api/v1/mobility/rides/{ride_uid}/tracking` - Persist and broadcast location update
- `GET /api/v1/mobility/vehicles/nearby` - Nearby active drivers for map markers
- `WS /api/v1/mobility/rides/{ride_uid}/chat/ws` - Live ride chat channel
- `WS /api/v1/mobility/rides/{ride_uid}/meeting-lobby/ws` - Live same-rider lobby chat channel
- `WS /api/v1/mobility/rides/{ride_uid}/tracking/ws` - Live ride tracking channel
- `WS /api/v1/mobility/vehicles/stream/ws` - Nearby vehicle stream for booking map

## Environment Variables

- `APP_NAME`
- `APP_ENV`
- `DEBUG`
- `API_V1_PREFIX`
- `DATABASE_URL`
- `JWT_SECRET_KEY`
- `JWT_ALGORITHM`
- `ACCESS_TOKEN_EXPIRE_MINUTES`
- `CORS_ORIGINS`

## Notes

- SQLite is configured by default for fast local setup.
- Tables are auto-created at startup.
- Demo commute + driver location data is seeded automatically on first run.
- For production, use Postgres and a strong `JWT_SECRET_KEY`.
