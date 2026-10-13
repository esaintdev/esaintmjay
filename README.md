# Esaint Mjay — Graphic Designer Portfolio

A standard Next.js application with an editable public portfolio and a protected admin studio at `/admin`. The reference-inspired design uses warm off-white, black, orange, bold headings, outlined panels, and generous space. Body copy is 17–20 px, admin inputs are 16 px, and small labels are at least 15 px.

## Start the project

Use **Node.js 24 or newer**. Node supplies SQLite directly. No separate database installation is needed.

```bash
npm install
cp .env.example .env.local
npm run admin:setup
npm run dev
```

On Windows, copy `.env.example` to `.env.local` in Explorer or use PowerShell `Copy-Item .env.example .env.local`.

Open `http://localhost:3000`. Sign in at `http://localhost:3000/admin` using the account created by the setup command. Setup prompts for your email and a password of at least 12 characters, with hidden password input. There is no default password or public registration endpoint.

Only three direct dependencies: **Next.js, React, React DOM**. Plain JavaScript and CSS; no ORM, UI kit, Tailwind, upload library, authentication package, or CMS service. Use `npm install`; there is no npm CI requirement.

## Company → design gallery

1. Open **Work collections → New collection**.
2. Enter the company, client, workplace, or group name. Add category, period, your role, and a description.
3. Save the collection, then use **Upload designs** to select multiple images together.
4. Edit design titles, alt text, and captions. Use the arrows to arrange the gallery.
5. Choose a cover image in the collection details. The first image is the fallback cover.
6. Preview the collection while signed in. Enable **Published** when ready.
7. Repeat for every company. Each has a separate gallery at `/work/company-slug`.

All portfolio images belong to a group. Draft groups and their media remain private. Deleting a group requires confirmation and deletes its image records and files. Changing the slug changes the public URL.

## Administration included

- Live overview counts and collection search.
- Full company/group CRUD, image uploads, covers, captions, ordering, featured indicator, draft/publish controls, and authenticated preview.
- Profile and homepage text, availability, specialties, About text, location, and experience summary.
- Services, experience, awards, and articles: CRUD, ordering, and draft/publish controls.
- Dedicated article reading pages. Blank lines create paragraphs; no unsafe HTML is rendered.
- Portrait upload, replacement, and removal.
- PDF CV upload, replacement, removal, and public download buttons.
- Contact form and private inbox with read/unread controls, deletion, and email reply links.
- Social links, accent colour, section visibility, search title/description, and footer note.
- Change admin email/password and revoke all active sessions.
- Forgotten-password reset through `npm run admin:setup` on your server.
- Backup command for the database and uploaded files.

Editable content lives in SQLite, not in page source. The initial copy and name are editable defaults. No clients, statistics, awards, qualifications, testimonials, or contact details have been invented. Add your real work and details. The hero uses your initials until you upload a portrait. Empty awards, experience, and article sections stay hidden; services fall back to your editable specialties until you add entries.

## Uploads and persistence

Default storage is `data/portfolio.sqlite` and `data/uploads/`. SQLite may also create `-wal` and `-shm` files while running. Set an absolute `DATA_DIR` to change location. The Node process must have write access. Never expose this directory as a public web folder.

- Images: PNG, JPEG, WebP, GIF, up to **15 MB per image**.
- CV: PDF, up to **10 MB**.
- Upload signatures and streamed byte limits are checked on the server. SVG, HTML, and executable file formats are rejected.
- Images are served from original uploads. Resize large artwork for the web before uploading; no extra image processing package is used.
- CV replacement removes the old file and download URL.
- Media delivery checks group publication or admin authentication and sends private, no-store headers.
- Unpublishing stops subsequent public access; it cannot revoke copies someone already downloaded.

## Production hosting

Use a Node host/VPS or container with a **persistent disk**, preferably one application instance. Static hosting or ephemeral serverless storage is unsuitable for this SQLite/filesystem configuration. This is native Next.js, not a Vinext or Cloudflare adapter.

Set `.env.local` or your host's environment:

```dotenv
APP_ORIGIN=https://your-domain.example
DATA_DIR=/var/lib/esaint-portfolio
TRUST_PROXY=false
```

`APP_ORIGIN` is required in production and must match the browser origin exactly. It validates writes and enables secure cookies for HTTPS.

```bash
npm install
npm run admin:setup
npm run build
npm start
```

Configure HTTPS, process restart after reboot, request bodies up to 16 MB, and persistent `DATA_DIR` across deployments. Never serve the data folder publicly. If your reverse proxy overwrites `X-Forwarded-For` with the actual client IP, set `TRUST_PROXY=true` for per-client throttling; otherwise keep it false. Without a trusted proxy, requests share conservative limits. Login allows 10 attempts per 15 minutes; contact allows 5 submissions per 15 minutes per bucket.

The inbox stores enquiries in the application. It does not send email notifications. Reply opens your configured email app; no SMTP service is required.

## Backups

Stop the app before backup to keep the database and files consistent:

```bash
npm run backup
# Or choose a private destination outside DATA_DIR:
npm run backup -- /absolute/path/to/backup
```

The backup contains `portfolio.sqlite` and `uploads/`. Keep it private, since it includes account hashes and enquiries. Keep an additional copy outside the server.

To restore: stop the app, retain the current data directory as a rollback copy, then copy the backed-up SQLite file and uploads into a clean `DATA_DIR`. Do not reuse old `-wal` or `-shm` files. Restore filesystem permissions and restart. Run `npm run admin:setup` to reset access and invalidate sessions if needed.

## Verification and limitations

```bash
npm run build
npm test
```

Tests use Node's built-in runner and isolated temporary storage, exercise the production HTTP routes, then stop the test server. No testing package is required. Browser visual and interaction QA still needs to be done on your machine; an interactive browser was not available here. No live deployment is included.

## Source structure

- `app/`: App Router pages and API routes.
- `app/api/admin/[[...path]]/`: protected CRUD and file uploads.
- `app/api/auth/`: login/logout.
- `app/api/contact/`: public enquiry submission.
- `app/media/[id]/`: publication-aware file delivery.
- `app/work/[slug]/`: company galleries.
- `app/journal/[id]/`: articles.
- `components/`: public and admin UI.
- `lib/`: SQLite, sessions, passwords, validation, limits.
- `scripts/`: administrator setup and backups.
- `tests/`: security and production-route checks.
# esaintmjay
