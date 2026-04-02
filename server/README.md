# Ridr Backend (FastAPI)

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
- For production, use Postgres and a strong `JWT_SECRET_KEY`.
