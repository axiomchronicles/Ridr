# Welcome to React Router!

A modern, production-ready template for building full-stack React applications using React Router.

[![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz.svg)](https://stackblitz.com/github/remix-run/react-router-templates/tree/main/default)

## Features

- 🚀 Server-side rendering
- ⚡️ Hot Module Replacement (HMR)
- 📦 Asset bundling and optimization
- 🔄 Data loading and mutations
- 🔒 TypeScript by default
- 🎉 TailwindCSS for styling
- 📖 [React Router docs](https://reactrouter.com/)

## Getting Started

### Installation

Install the dependencies:

```bash
npm install
```

Configure Google Maps API access for the booking map experience:

```bash
cp .env.example .env
```

Set `VITE_GOOGLE_MAPS_API_KEY` in `.env` with a browser key that has these APIs enabled:

- Maps JavaScript API
- Directions API
- Geocoding API
- Places API

Set `VITE_API_BASE_URL` in `.env` to point to the FastAPI server (default: `http://localhost:8000/api/v1`).

### Backend Setup (FastAPI)

The backend lives in `server/` and uses FastAPI + SQLAlchemy + JWT auth.

```bash
cd server
source env/bin/activate
env/bin/pip install -r requirements.txt
cp .env.example .env
env/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir .
```

API docs will be available at `http://localhost:8000/docs`.

### Development

Start the development server with HMR:

```bash
npm run dev
```

Your application will be available at `http://localhost:5173`.

## Building for Production

Create a production build:

```bash
npm run build
```

## Deployment

### Docker Deployment

This repository now includes two Docker Compose deployment modes:

- `docker-compose.yml` - builds frontend/backend locally and runs Nginx as the public reverse proxy.
- `docker-compose.server.yml` - pulls prebuilt frontend/backend images on a server and runs Nginx as the public reverse proxy.

Nginx is the only public entrypoint, so the app is available at `http://localhost` by default.

#### Local Production-Like Build (build images from source)

```bash
docker compose -f docker-compose.yml up --build -d
```

Optional environment overrides before build/run:

```bash
export VITE_API_BASE_URL=/api/v1
export VITE_DOCKER_API_BASE_URL=/api/v1
export VITE_GOOGLE_MAPS_API_KEY=your_key_here
export JWT_SECRET_KEY=replace-with-a-strong-secret
export NGINX_HTTP_PORT=80
export NGINX_HTTPS_PORT=443
```

`VITE_DOCKER_API_BASE_URL` is used by Docker Compose builds so local development settings in `VITE_API_BASE_URL` do not accidentally leak into production images.

HTTPS and domain setup for `ecoridr.tubox.cloud`:

- Nginx is configured to redirect HTTP to HTTPS for `ecoridr.tubox.cloud`.
- Place certificate files at `nginx/ssl/fullchain.pem` and `nginx/ssl/privkey.pem`.
- Example copy commands from Let's Encrypt:

```bash
cp /etc/letsencrypt/live/ecoridr.tubox.cloud/fullchain.pem nginx/ssl/fullchain.pem
cp /etc/letsencrypt/live/ecoridr.tubox.cloud/privkey.pem nginx/ssl/privkey.pem
```

- For local/testing only, you can generate a self-signed certificate:

```bash
./nginx/ssl/generate-self-signed.sh
```

- Start the stack and access the app at `https://ecoridr.tubox.cloud`.
- If you need ACME HTTP-01 challenge support, challenge files are served from `nginx/www/`.

To stop:

```bash
docker compose -f docker-compose.yml down
```

To stop and remove backend data volume:

```bash
docker compose -f docker-compose.yml down -v
```

#### Server Deployment (pull frontend/backend images)

Deploy by building and starting containers directly on the server:

```bash
docker compose -f docker-compose.server.yml up --build -d
```

Stop server deployment:

```bash
docker compose -f docker-compose.server.yml down
```

If you only want frontend as a standalone image:

```bash
docker build -t my-app .

# Run the container
docker run -p 3000:3000 my-app
```

The containerized application can be deployed to any platform that supports Docker, including:

- AWS ECS
- Google Cloud Run
- Azure Container Apps
- Digital Ocean App Platform
- Fly.io
- Railway

### DIY Deployment

If you're familiar with deploying Node applications, the built-in app server is production-ready.

Make sure to deploy the output of `npm run build`

```
├── package.json
├── package-lock.json (or pnpm-lock.yaml, or bun.lockb)
├── build/
│   ├── client/    # Static assets
│   └── server/    # Server-side code
```

## Styling

This template comes with [Tailwind CSS](https://tailwindcss.com/) already configured for a simple default starting experience. You can use whatever CSS framework you prefer.

---

Built with ❤️ using React Router.
