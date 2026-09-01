# Test Login Accounts (LOCAL DEV ONLY)

> This file deliberately contains **no passwords**. It used to print three
> working password pairs, and this repository is public. The accounts are
> local-only and carry no authority against a real Firebase project, so the
> technical blast radius was contained — but a published password invites reuse,
> and reuse is the actual risk. You choose the values now; nothing is committed.

These accounts exist for `AUTH_MODE=local`. They live in the gitignored
`.local-users.json`, bcrypt-hashed, and mean nothing outside your machine.

| Role     | Email                    | Reaches                                        |
| -------- | ------------------------ | ---------------------------------------------- |
| Admin    | `admin@hvac-auto.dev`    | `/admin` (users, audit log, price controls) + all engineer features |
| Engineer | `engineer@hvac-auto.dev` | Everything except the admin portal — useful for verifying RBAC blocks admin-only routes |

## Password policy

Whatever you choose must satisfy the app's own registration rule, or the seed
will be rejected by the same validator the UI uses:

- at least 12 characters
- mixed case
- at least one digit
- at least one symbol

## Seeding the accounts

`SEED_USER_PASSWORD` has no default. The script exits with an explanation if it
is unset, rather than falling back to a value that would be public by virtue of
being in this repository.

```bash
SEED_USER_PASSWORD='<a password you choose>' npm run seed:mock
```

That creates `test@hvac-auto.dev` as an admin **plus** sample projects. Override
the account with `SEED_USER_EMAIL` / `SEED_USER_NAME` if you want the seeded
projects owned by an account that already exists.

To create the two accounts in the table above without sample data, register
them through `/auth/register` while the app is running — that path applies the
same policy and hashing as everything else, so there is no separate script to
keep in sync.

## If you are locked out

Five failed attempts for one email within 15 minutes triggers a 15-minute
lockout; a successful login clears the counter. To clear it manually, delete the
matching document under `loginLockouts` in `.local-firestore.json`.

## Rotating a password you no longer want

Sign in and change it from the UI, or delete `.local-users.json` and re-seed.
Because the store is gitignored, nothing you set here can reach the repository.
