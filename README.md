# HVAC Auto Estimation Project

## What This System Does

This system is an HVAC engineering platform that helps you design and estimate mechanical cooling projects faster.

Main capabilities:

1. Create HVAC projects with building floors and rooms.
2. Calculate room cooling loads based on room data and design assumptions.
3. Select equipment and review sizing outputs.
4. Generate BOQ/costing-ready project data.
5. Use diagnostics and simulation workspaces for deeper engineering checks.
6. Manage users with role-based access (admin and engineer).

In short: it takes a project from room data to load results, equipment decisions, and reporting-ready outputs in one app.

## How To Launch Locally

1. Open a terminal in the project root.
2. Install dependencies:

```bash
npm install
```

3. Start the app:

```bash
npm run dev
```

4. Open the app in your browser:

```text
http://localhost:3000
```
## Notes

1. For local development, the app supports local auth/data fallback when Firebase credentials are not configured.
2. If port 3000 is already in use, stop the existing process and run `npm run dev` again.
