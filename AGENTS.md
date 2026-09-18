# AGENTS.md

Self-hosted fitness tracker. Greenfield repo: no code or build tooling exists yet, so no
install/build/test commands are defined — add them here when scaffolding is introduced.

## Stack

- Backend: Python + FastAPI
- Database: SQLite + SQLAlchemy
- Frontend: React + Vite + TypeScript + TailwindCSS
- Charts: Recharts

## Required workflow

1. Before writing any code, propose the database schema and folder structure and get approval.
2. Implement backend first, then frontend.

## Project conventions

- Mobile-first responsive UI.
- Set entry flow must be completable in under 5 seconds of interaction.
- Store all timestamps in UTC (convert only at the UI edge).
- Dark mode is the default.
- DB seeding: ~50 common exercises and ~30 days of fake workout data.
