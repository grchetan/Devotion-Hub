# Radha Naam Leaderboard

A secure devotional typing platform where users type **Radha** and compete in a real-time leaderboard, plus a protected admin dashboard.

## Features

### User
- Username + session start
- Exact `Radha` typing earns +1 score
- Live leaderboard updates
- Paste and Ctrl/Cmd+V disabled
- Anti-spam delay validation
- Abusive words detection with 3 warnings then 24h ban

### Security
- Global API rate limiting
- Admin login rate limiting
- Server-side validation
- JWT-protected admin routes
- Bcrypt hashed admin password

### Admin
- Login with username/password
- Dashboard stats: total users, active users, total count, banned users, total submissions
- User management: ban / unban
- Leaderboard reset
- Activity feed from DB logs

## Tech Stack
- Node.js + Express
- MongoDB + Mongoose
- HTML/CSS/JavaScript frontend

## Run

```bash
npm install
node server.js
```

- User app: `http://localhost:3000`
- Admin panel: `http://localhost:3000/admin.html`

