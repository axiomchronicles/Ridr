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

To containerize both frontend and backend with Docker Compose:

```bash
docker compose up --build
```

Frontend will be available at `http://localhost:3000` and backend at `http://localhost:8000`.

To run detached:

```bash
docker compose up --build -d
```

To stop containers:

```bash
docker compose down
```

To remove containers and backend data volume:

```bash
docker compose down -v
```

If you need Google Maps in container builds, export your key before building:

```bash
export VITE_GOOGLE_MAPS_API_KEY=your_key_here
docker compose up --build
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
