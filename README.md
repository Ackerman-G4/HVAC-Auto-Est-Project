# HVAC Auto Estimation Project

HVAC Auto Estimation is a full-stack web app for preparing HVAC project estimates quickly. It helps teams create projects, define rooms/floors, run cooling-load calculations, auto-size equipment, and generate BOQ/cost outputs in one workflow.

## Tech Stack / Languages Used

- TypeScript (frontend + backend API)
- React + Next.js (App Router)
- Prisma ORM + SQLite
- Python (calculation service support under `services/calc-engine`)
- CSS/Tailwind utilities for UI styling

## Project Objectives

- Speed up HVAC pre-design and estimation work
- Automate cooling-load and equipment sizing decisions
- Generate transparent, structured BOQ and costing outputs
- Keep project data centralized (projects, floors, rooms, materials, suppliers)
- Provide a practical workflow for Philippine HVAC use cases

## Core Features

- Project creation and management
- Room/floor modeling and load inputs
- Cooling load calculation API
- Automatic equipment sizing and selection
- BOQ generation with cost summaries
- Materials and supplier management

## Getting Started

1. Install dependencies:

```bash
npm install
```

2. Sync database schema and generate Prisma client:

```bash
npx prisma db push
npx prisma generate
```

3. Run the app:

```bash
npm run dev
```

Open `http://localhost:3000` in your browser.

## Build

```bash
npm run build
```
