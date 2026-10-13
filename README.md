# Esaint Mjay — Graphic Designer Portfolio

A standard Next.js application with an editable public portfolio and a protected admin studio at `/admin`. The reference-inspired design uses warm off-white, black, orange, bold headings, outlined panels, and generous space. Body copy is 17–20 px, admin inputs are 16 px, and small labels are at least 15 px.

All content lives in **Supabase**: PostgreSQL holds the text, settings, account and enquiries, and a **private** Supabase Storage bucket holds the uploaded images and CV.

## Start the project

Use **Node.js 20.9 or newer** and a Supabase project ([supabase.com](https://supabase.com), free tier is fine).

### 1. Configure environment variables

```bash
npm install
cp .env.example .env.local
```

On Windows, copy `.env.example` to `.env.local` in Explorer or use PowerShell `Copy-Item .env.example .env.local`.

Fill in `.env.local` from your Supabase dashboard:

| Variable | Where to find it | Required |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API → Project URL | yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API → `anon` key | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` key | yes — **server only, never share or commit it** |
| `SUPABASE_STORAGE_BUCKET` | Any name; created for you by the migration | no (default `portfolio-assets`) |
| `SUPABASE_ACCESS_TOKEN` | Account → Access Tokens (used only by `npm run migrate`) | one of these two |
| `DATABASE_URL` | Project Settings → Database → connection string (used only by `npm run migrate`) | one of these two |
| `APP_ORIGIN` | Your site's address, e.g. `http://localhost:3000` | yes in production |
| `TRUST_PROXY` | See [Production hosting](#production-hosting) | no (default `false`) |

### 2. Create the database tables and storage bucket

```bash
npm run migrate
```

This runs `scripts/migrate.sql`, which creates the tables, the rate-limit function, row-level security policies and the private storage bucket. It is safe to run again. If you prefer, paste `scripts/migrate.sql` into **Supabase Dashboard → SQL Editor** and run it there instead (if you changed `SUPABASE_STORAGE_BUCKET`, edit the bucket name at the bottom of the file first).

### 3. Create the admin account and start

```bash
npm run admin:setup
npm run dev
```

Open `http://localhost:3000`. Sign in at `http://localhost:3000/admin` using the account created by the setup command. Setup prompts for your email and a password of at least 12 characters, with hidden password input. For non-interactive environments, set `ADMIN_EMAIL` and `ADMIN_PASSWORD` instead. There is no default password or public registration endpoint.

Direct dependencies: **Next.js, React, React DOM, and `@supabase/supabase-js`** (`pg` is a dev dependency used only by `npm run migrate` with `DATABASE_URL`). Plain JavaScript and CSS; no ORM, UI kit, Tailwind, upload library or authentication package.

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
- Forgotten-password reset through `npm run admin:setup`.
- Backup command for the database and uploaded files.

Editable content lives in the database, not in page source. The initial copy and name are editable defaults. No clients, statistics, awards, qualifications, testimonials, or contact details have been invented. Add your real work and details. The hero uses your initials until you upload a portrait. Empty awards, experience, and article sections stay hidden; services fall back to your editable specialties until you add entries.

## Uploads and media delivery

Uploads are stored in the Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`. The bucket is **private**: Supabase never serves the files directly. Every image and the CV are delivered through `/media/[id]` on this site, which:

- serves a file only if its collection is published, it is the current portrait or CV, or you are signed in as admin (so drafts can be previewed but not reached by anyone else);
- returns 404 for anything else;
- lets public files sit in the visitor's browser cache for up to 5 minutes, and never caches drafts;
- sends the CV as a download named `Esaint-Mjay-CV.pdf`.

Keep the bucket private. Making it public would let anyone with a file name download draft artwork. Running `npm run migrate` sets it back to private.

Upload limits:

- Images: PNG, JPEG, WebP, GIF, up to **15 MB per image**.
- CV: PDF, up to **10 MB**.
- Upload signatures and streamed byte limits are checked on the server. SVG, HTML, and executable file formats are rejected.
- Images are served from the original uploads. Resize large artwork for the web before uploading; no image processing package is used.
- Replacing the CV or portrait removes the old file.
- Unpublishing stops subsequent public access. It cannot revoke copies someone already downloaded.

## Security notes

- The **service-role key** bypasses row-level security. It is read only on the server (`lib/supabase.mjs`); never prefix it with `NEXT_PUBLIC_` or expose it to the browser.
- Row-level security is enabled on every table. With the public anon key, only published collections, images, entries and the site settings can be read; the admin account, sessions, rate limits and enquiries cannot.
- Admin passwords are salted scrypt hashes. Sessions last 8 hours and are stored as SHA-256 hashes of the cookie token.
- **Rate limits**: login allows 10 attempts and the contact form 5 submissions per 15 minutes per client. Counting happens atomically in Postgres (`rate_limit_increment`), which only the server's service role may call. If the limit cannot be checked (for example, the migration hasn't been run), login and contact requests are refused with a 503 rather than left unlimited.
- All writes must come from `APP_ORIGIN`.

## Production hosting

Any Node.js host that runs `next start` works, such as a VPS, a container, or a Node platform. The app keeps no files on its own disk, so ephemeral storage is fine. The host must accept request bodies up to 16 MB for image uploads; some serverless platforms cap uploads lower (for example, about 4.5 MB on Vercel functions), which would reject larger images.

Set these on your host:

```dotenv
APP_ORIGIN=https://your-domain.example
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_STORAGE_BUCKET=portfolio-assets
TRUST_PROXY=false
```

`APP_ORIGIN` is required in production and must match the browser origin exactly. It validates writes and enables secure cookies for HTTPS.

```bash
npm install
npm run migrate        # once, and again after updating scripts/migrate.sql
npm run admin:setup    # once
npm run build
npm start
```

Configure HTTPS. If your reverse proxy overwrites `X-Forwarded-For` with the real client IP, set `TRUST_PROXY=true` for per-client throttling. Otherwise keep it `false`, and all visitors share the same conservative limits.

The inbox stores enquiries in the application. It does not send email notifications. Reply opens your configured email app; no SMTP service is required.

## Backups

Supabase keeps its own database backups (daily on paid plans). To keep an independent copy:

```bash
npm run backup
# Or choose a private destination:
npm run backup -- /absolute/path/to/backup
```

This writes `tables/*.json` (settings, admin, groups, assets, entries, messages) and `files/` (every file in the bucket) to `backups/<timestamp>/`. Keep it private: it includes the admin password hash and enquiries. Keep an additional copy off your computer.

To restore into a fresh project: run `npm run migrate`, upload the contents of `files/` to the bucket root (Dashboard → Storage), then import each JSON file into its table, inserting `groups` before `assets`. Afterwards, run `npm run admin:setup` to reset access if needed.

## Verification

```bash
npm run build
npm test
```

Tests use Node's built-in runner; no testing package is required.

- `tests/security.test.mjs` checks password hashing, validation, file-type detection and upload limits. It runs offline.
- `tests/application.test.mjs` starts the production build and exercises every route: login, cross-origin protection, uploads, draft media privacy, publishing, CV replacement, settings, articles, the inbox, rate limiting, deletion and password changes. **It erases all data in the configured Supabase project and replaces the admin account**, so it is skipped unless you point `.env.local` at a separate, disposable Supabase project and run:

  ```bash
  SUPABASE_TEST_PROJECT=true npm test
  ```

Browser visual and interaction QA still needs to be done by hand.

## Source structure

- `app/`: App Router pages and API routes.
- `app/api/admin/[[...path]]/`: protected CRUD and file uploads.
- `app/api/auth/`: login/logout.
- `app/api/contact/`: public enquiry submission.
- `app/media/[id]/`: publication-aware file delivery from the private bucket.
- `app/work/[slug]/`: company galleries.
- `app/journal/[id]/`: articles.
- `components/`: public and admin UI.
- `lib/supabase.mjs`: server-side Supabase clients and bucket name.
- `lib/db.mjs`: settings, collections, assets, entries and storage helpers.
- `lib/security.mjs`: sessions, passwords, validation, rate limits.
- `scripts/migrate.sql` and `scripts/run-migration.mjs`: database schema and the `npm run migrate` runner.
- `scripts/admin.mjs`: administrator setup and reset.
- `scripts/backup.mjs`: local backup of tables and files.
- `tests/`: security and production-route checks.
