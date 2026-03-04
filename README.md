# Radha Naam Leaderboard

A spiritual-themed typing web app where users manually type **Radha** to earn points and rise on a live leaderboard, with a secure admin control panel.

## User Features

- Exact word validation (`Radha` only) with real-time score updates.
- Anti-cheat protections: paste disabled, Ctrl/Cmd+V blocked, one-word submissions, backend delay checks.
- Abuse detection with warnings and 24-hour temporary ban after 3 abusive attempts.
- Real-time leaderboard sorted by total count.
- Username + session binding to prevent session swapping.

## Admin Panel Features

Visit `/admin.html`:

- JWT-based admin login (`/api/admin/login`) with bcrypt password hash verification.
- Dashboard cards:
  - Total Users
  - Active Users Today
  - Total Radha Count
  - Banned Users
  - Total Submissions
- Live activity feed (typed Radha / abusive word / banned / suspicious speed).
- User management actions: ban, unban, reset user count, delete user.
- Leaderboard control: view and reset leaderboard.
- Abuse monitor with warnings and suspicious activity list.

## Security

- Rate limiting on all API routes.
- Additional rate limiting on admin login.
- JWT auth middleware for all admin management routes.
- Server-side validation for session, usernames, and admin actions.

## Stack

- Frontend: HTML/CSS/JavaScript
- Backend: Node.js + Express
- Database: MongoDB (with automatic in-memory fallback when `MONGO_URI` is missing)

## Run

```bash
npm install
npm start
```

Open:
- App: `http://localhost:3000`
- Admin: `http://localhost:3000/admin.html`

## Environment

Copy `.env.example` to `.env` and set values securely.
