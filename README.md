# Radha Naam Leaderboard

A spiritual-themed typing web app where users manually type **Radha** to earn points and rise on a live leaderboard.

## Features

- Exact word validation (`Radha` only) with real-time score updates.
- Anti-cheat protections: paste disabled, Ctrl/Cmd+V blocked, one-word submissions, backend delay checks.
- Abuse detection with warnings and 24-hour temporary ban after 3 abusive attempts.
- Real-time leaderboard sorted by total count.
- Username + session binding to prevent session swapping.
- Backend security via request rate limiting and strict server-side validation.
- Optional daily reset endpoint secured with reset key.

## Stack

- Frontend: HTML/CSS/JavaScript
- Backend: Node.js + Express
- Database: MongoDB (with automatic in-memory fallback when `MONGO_URI` is missing)

## Run

```bash
npm install
npm start
```

Open: `http://localhost:3000`

## Environment

Copy `.env.example` to `.env` and set values as needed.
