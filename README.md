# Northline

Admin portal for Northline Landscaping: track clients and job status, generate seasonal marketing specials, and email them to clients.

Built with Node.js, Express, PostgreSQL and Resend. Hosted on Render.

## Work on it locally (Mac)

1. Install Node.js LTS from https://nodejs.org (one time).
2. Double-click **Start Local Preview.command**.
   - The first time, it creates a `.env` file and opens it. Fill in `DATABASE_URL`, `ADMIN_EMAIL` and `ADMIN_PASSWORD`, save, and double-click again.
   - It installs packages, starts the site and opens http://localhost:3000/login.
3. Edit files and save. The server restarts by itself; refresh the browser to see changes.

Nothing you do locally affects the live site until you publish.

## Test database (local work)

`npm run dev` (and **Start Local Preview.command**) starts a private test database in `.testdb/` when `.env` points at `127.0.0.1:5433`. Nothing you do locally touches real customers or logins.

- Fill it with demo data and demo sign-ins (owner, admin, two crew): `npm run seed:test` — the demo logins are listed at the top of `scripts/seed-test.js`.
- To work against live data instead, swap the two `DATABASE_URL` lines in `.env`.

## Team accounts and roles

| Role | Can see |
| --- | --- |
| Owner | Everything, plus the **Team** page (add people, change roles, switch off access) |
| Admin | Requests, quotes, jobs, schedule, clients, applicants, email — not the Team page |
| Crew | Only **My schedule** at `/crew`: their own jobs, addresses, notes, photos. Never prices. |

Add people on **Team → Add someone**. You get a one-time link (shown once, valid 7 days) to text or email them; they choose their own password. Forgot password? Make them a new link.

## English / Español

With `DEEPL_API_KEY` set (in `.env` locally, and in Render's Environment for the live site), an **EN | ES** switch appears on the website, crew screens and sign-in pages. The office admin stays in English.

- Pages are written in English and translated by DeepL the first time someone views them in Spanish; every sentence is saved in the database, so later visits are instant and use none of the DeepL allowance.
- Customers get the polite *usted*; crew screens use the friendly *tú*.
- Prices, "Northline" and anything marked `translate="no"` (customer names, addresses) are never translated.
- House terms DeepL gets wrong (e.g. "crew" → "equipo", not "tripulación") are fixed in `lib/translate.js` → `TERMS`.
- Without a key, the switch simply doesn't show.

## Publish to the live site

Double-click **Publish to Live.command**. It commits your changes, pushes to GitHub, and Render redeploys automatically in a couple of minutes.

## Settings (.env locally / Environment tab on Render)

| Name | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | `true` for hosted databases that need SSL |
| `SESSION_SECRET` | Long random string for login cookies |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First admin login, created on startup if none exists |
| `RESEND_API_KEY` | From resend.com. Leave blank to preview emails without sending |
| `EMAIL_FROM` | e.g. `Northline Home & Outdoor <hello@northlinehomeandoutdoors.com>` (domain must be verified in Resend) |
| `DEEPL_API_KEY` | From deepl.com — turns on the English/Español switch |

Add an account from the command line: `npm run admin:create -- name@example.com "password" [owner|admin|crew]`

## Database

The app creates its own tables on startup, all prefixed `nl_` so they don't clash with existing tables in your database.
