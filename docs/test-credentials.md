# Test Login Credentials (LOCAL DEV ONLY)

> ⚠️ These are **local development** accounts for `AUTH_MODE=local`. They live in
> the gitignored `.local-users.json` (bcrypt-hashed) and have no meaning against a
> real Firebase project. Do not reuse these passwords anywhere real.

The app is running in local auth + local Firestore mode (no emulator or Firebase
needed). Two accounts were seeded:

| Role     | Email                     | Password            |
| -------- | ------------------------- | ------------------- |
| Admin    | `admin@hvac-auto.dev`     | `StudioBreeze#7421` |
| Engineer | `engineer@hvac-auto.dev`  | `JadeAirflow#5093`  |

- **Admin** can reach `/admin` (users, audit log, price controls) and all
  engineer features.
- **Engineer** is the default role — everything except the admin portal (useful
  for verifying RBAC blocks admin-only routes).

## How to use

1. Start the app: `npm run dev`.
2. Go to `/auth/login` and sign in with either account above.

Both passwords satisfy the app's registration policy (≥12 chars, mixed case +
digit + symbol), so you can also change them from the UI later.

## Re-seeding

To recreate these accounts (or after deleting `.local-users.json`):

```bash
node -e "const fs=require('fs'),b=require('bcryptjs'),n=new Date().toISOString();\
const mk=(e,nm,r,p)=>({id:'local_seed_'+Math.random().toString(36).slice(2,10),email:e,name:nm,passwordHash:b.hashSync(p,10),role:r,createdAt:n});\
fs.writeFileSync('.local-users.json',JSON.stringify({users:[mk('admin@hvac-auto.dev','Studio Admin','admin','StudioBreeze#7421'),mk('engineer@hvac-auto.dev','Studio Engineer','engineer','JadeAirflow#5093')]},null,2))"
```

Alternatively, `npm run seed:mock` (with the dev server running) creates
`test@hvac-auto.dev` / `SeedMockPass2026!` (admin) **plus** sample projects.

## Note on lockout

Five failed attempts for one email in 15 minutes triggers a 15-minute lockout
(Wave 8 also adds a higher-threshold IP-scoped lockout). A successful login
clears the email counter. If you get locked out during testing, delete the
matching doc from `.local-firestore.json` under `loginLockouts`.
