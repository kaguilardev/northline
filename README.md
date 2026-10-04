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
| `EMAIL_FROM` | e.g. `Northline Landscaping <hello@yourdomain.com>` (domain must be verified in Resend) |

Add another admin: `npm run admin:create -- name@example.com "password"`

## Database

The app creates its own tables on startup, all prefixed `nl_` so they don't clash with existing tables in your database.
