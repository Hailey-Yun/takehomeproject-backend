# Take Home Project – Backend

## Base URL
https://takehomeproject-backend.onrender.com  
Health: https://takehomeproject-backend.onrender.com/health

## Tech Stack
- Node.js + TypeScript + Express
- Postgres

## Main Endpoints
- `GET /parcels`
  - Supports guest vs logged-in behavior via `isAuthenticated` flag (take-home constraint)
- `GET /parcels/export.csv`
  - Exports filtered results as CSV

## Environment Variables
- `DATABASE_URL` = postgres://takehome:Kss7JKSC4N@108.61.159.122:13432/gis
- `ALLOWED_ORIGINS` = https://startling-raindrop-e9c0c1.netlify.app

## Local Development
```bash
npm install
npm run dev
