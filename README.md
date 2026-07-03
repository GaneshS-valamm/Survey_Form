# Survey Form Application

A JSON-driven survey application with a React frontend and FastAPI backend.

## Overview

- Backend: `backend/app/main.py` using FastAPI, SQLAlchemy, and PostgreSQL.
- Frontend: `frontend/src/App.jsx` using React and Vite.
- The survey structure is defined in `backend/data/survey.json`.
- Admin dashboard includes analytics, graphs, and response export.

## Environment Variables

The backend reads these values from the environment:

- `DATABASE_URL` - PostgreSQL connection string
- `ADMIN_USERNAME` - admin login username
- `ADMIN_PASSWORD` - admin login password
- `PORT` - HTTP port for the backend server

The frontend can also use:

- `VITE_API_URL` - backend API base URL for production

## Local Development

### Backend

```bash
cd backend
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8003
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- --host 0.0.0.0
```

If the frontend and backend are running locally, you can set `VITE_API_URL` in `frontend/.env` or use the default `http://127.0.0.1:8002` if the backend runs there.

## Render Deployment

Yes — the backend is designed to work with the following environment variables set:

- `DATABASE_URL=postgresql://postgres:PalTfCTXRDjYpjmfHbfYZvoIipSxKIiw@reseau.proxy.rlwy.net:45367/railway`
- `ADMIN_USERNAME=nikil`
- `ADMIN_PASSWORD=admin`
- `PORT=8003`

### Important Render notes

- Render typically provides its own `PORT` value for a web service. If you set `PORT=8003` manually, be sure Render is configured to use that port. Otherwise, omit `PORT` and let Render inject the assigned port.
- The backend will fully work with `DATABASE_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` set as above.
- For the frontend on Render, set `VITE_API_URL` to your backend service URL.

## Production / Hosting Setup

The app is separated into backend and frontend services:

- Deploy the backend as a Render Web Service.
- Deploy the frontend as a Render Static Site or separate Web Service.

For the frontend, set:

```bash
VITE_API_URL=https://<your-backend-url>
```

## Admin Login

Use:

- Username: `nikil`
- Password: `admin`

## Notes

- The survey definition is stored in `backend/data/survey.json`, not in the database.
- Graphs in the admin dashboard use `recharts`.
- Do not commit production secrets to source control.
