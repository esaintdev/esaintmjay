# Esaint Mjay — Graphic Designer Portfolio

A standard Next.js application with an editable public portfolio and a protected admin studio at `/admin`. The reference-inspired design uses warm off-white, black, orange, bold headings, outlined panels, and generous space. Body copy is 17–20 px, admin inputs are 16 px, and small labels are at least 15 px.

All content lives in **Supabase**: PostgreSQL holds the text, settings, account and enquiries, and a **private** Supabase Storage bucket holds the uploaded images and CV.

## Start the project

Use **Node.js 22.18 or newer** and a Supabase project ([supabase.com](https://supabase.com), free tier is fine).

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

Direct dependencies: **Next.js, React, React DOM, `@supabase/supabase-js`, Lenis** (smooth scrolling) and **Tiptap** (the article editor). Dev dependencies are TypeScript and its type packages, plus `pg` (used only by `npm run migrate` with `DATABASE_URL`). No ORM, UI kit, Tailwind, upload library or authentication package.

## TypeScript

The whole project is **strict TypeScript** (`tsconfig.json` has `"strict": true`), with plain CSS.

- `npm run typecheck` checks every file. `npm run build` also type-checks and fails on errors.
- `lib/database.types.ts` describes the Supabase tables for the typed client. **When you change a column in `scripts/migrate.sql`, change it there too.** You can also regenerate it with `npx supabase gen types typescript --project-id <your-project-ref> > lib/database.types.ts`.
- `lib/types.ts` holds the shared app types (settings, collections, entries and the admin data), used by both the server and the admin UI.
- Scripts and tests are `.ts` files run directly by Node, which strips the types (this is why Node 22.18+ is required). Code that Node runs uses only type syntax that can be erased (no `enum` or `namespace`), and imports between those files keep their `.ts` extension. `tsconfig.json` enforces both.

## Company → design gallery

1. Open **Work collections → New collection**.
2. Enter the company, client, workplace, or group name. Add category, period, your role, and a description.
3. Save the collection, then use **Upload designs** to select multiple images together.
4. Edit design titles, alt text, and captions. Use the arrows to arrange the gallery.
5. Choose a cover image in the collection details. The first image is the fallback cover.
6. Preview the collection while signed in. Enable **Published** when ready.
7. Repeat for every company. Each has a separate gallery at `/work/company-slug`.

All portfolio images belong to a group. Draft groups and their media remain private. Deleting a group requires confirmation and deletes its image records and files. Changing the slug changes the public URL.

## Journal (articles)

Write articles in **Admin → Articles**. The editor has:

- Formatting: headings, bold, italic, underline, strikethrough, links, bulleted and numbered lists, quotes, dividers, undo/redo.
- **Images inside the text**: click **Image** in the toolbar. Select an image and click **Alt & caption** to describe it (for screen readers and search engines) and add a caption.
- A **cover image**, shown at the top of the article, on article cards, and as the preview image when the link is shared.
- **URL**: each article lives at `/journal/<slug>`. Leave it blank to create it from the title. Changing it changes the article's address.
- **Search & sharing**: optional SEO title (~60 characters) and meta description (~160 characters), with a live search-result preview. When left blank, the title and short introduction are used.
- Drafts: unpublished articles and their images are visible only to you while signed in, through **Preview**.

On the site, articles are listed newest first at **/journal** (in the menu when **Site settings → Visible sections → Articles** is on), and the latest three appear on the homepage. Edit the Journal title and introduction under **Profile & homepage**.

Each article page includes a canonical URL, Open Graph and Twitter tags (with the cover image), and `BlogPosting` structured data. The site also serves `/sitemap.xml` (pages, published collections and articles) and `/robots.txt`, which keeps `/admin` and the API out of search engines. Submit `https://your-domain/sitemap.xml` in Google Search Console once the site is live.

Article text is stored as structured JSON, not HTML. The server keeps only known formatting, safe links (`https`, `mailto`, or paths on this site) and images uploaded to this site, and the page renders only those, so pasted content can't inject scripts or styles. Images removed from an article are deleted when it is saved, and deleting an article deletes its images.

## Administration included

- Live overview counts and collection search.
- Full company/group CRUD, image uploads, covers, captions, ordering, featured indicator, draft/publish controls, and authenticated preview.
- Profile and homepage text, availability, specialties, About text, location, and experience summary.
- Services, experience and awards: CRUD, ordering, and draft/publish controls.
- Journal articles with a full writing editor (see below).
- Portrait upload, replacement, and removal.
- PDF CV upload, replacement, removal, and public download buttons.
- Contact form and private inbox with read/unread controls, deletion, and email reply links.
- Social links, accent colour, section visibility, search title/description, and footer note.
- Change admin email/password and revoke all active sessions.
- Forgotten-password reset through `npm run admin:setup`.
- Backup command for the database and uploaded files.

Editable content lives in the database, not in page source. The initial copy and name are editable defaults. No clients, statistics, awards, qualifications, testimonials, or contact details have been invented. Add your real work and details. The hero uses your initials until you upload a portrait. Empty awards, experience, and article sections stay hidden; services fall back to your editable specialties until you add entries.

## Uploads and media delivery

Files are stored in the Supabase Storage bucket named by `SUPABASE_STORAGE_BUCKET`. The bucket is **private**, so nothing in it has a permanent public address.

**Uploading.** Files go straight from the admin's browser to Supabase and never pass through the app server. This keeps uploads within the ~4.5 MB request limit of Vercel functions.

1. The admin page asks `/api/admin/upload` for a one-time upload link. The server checks you are signed in, plus the file's declared type and size.
2. The browser sends the file directly to Supabase with that link. The bucket itself refuses files over 15 MB or of the wrong type.
3. The admin page calls `/api/admin/upload/complete`. The server reads the start of the stored file to check its real format (signature) and size, deletes it if it doesn't match, and otherwise adds it to the portfolio.

**Viewing.** Every image and the CV are linked as `/media/[id]` on this site. That route:

- issues a link only if the file's collection is published, it is the current portrait or CV, or you are signed in as admin (so drafts can be previewed but not reached by anyone else);
- redirects to a signed Supabase link that expires after 10 minutes, so the file itself is downloaded from Supabase rather than through the app server;
- returns 404 for anything else;
- lets the browser reuse the redirect for public files for 5 minutes, and never caches it for drafts;
- makes the CV download as `Esaint-Mjay-CV.pdf`.

Keep the bucket private. Making it public would let anyone with a file name download draft artwork. Running `npm run migrate` sets it back to private and restores the size and type limits.

Upload limits:

- Images: PNG, JPEG, WebP, GIF, up to **15 MB per image**.
- CV: PDF, up to **10 MB**.
- File signatures and sizes are checked on the server after upload. SVG, HTML, and executable file formats are rejected, including when renamed.
- Images are served from the original uploads. Resize large artwork for the web before uploading; no image processing package is used.
- Replacing the CV or portrait removes the old file.
- Unpublishing stops new links at once. Links already handed out keep working until they expire (at most 10 minutes), and copies someone already downloaded can't be revoked.
- If an upload is abandoned between steps 2 and 3 (for example, the tab is closed), the file can be left in the bucket without appearing in the admin. These are harmless and can be deleted from Supabase Dashboard → Storage.

## Security notes

- The **service-role key** bypasses row-level security. It is read only on the server (`lib/supabase.ts`); never prefix it with `NEXT_PUBLIC_` or expose it to the browser.
- Row-level security is enabled on every table. With the public anon key, only published collections, images, entries and the site settings can be read; the admin account, sessions, rate limits and enquiries cannot.
- Admin passwords are salted scrypt hashes. Sessions last 8 hours and are stored as SHA-256 hashes of the cookie token.
- **Rate limits**: login allows 10 attempts and the contact form 5 submissions per 15 minutes per client. Counting happens atomically in Postgres (`rate_limit_increment`), which only the server's service role may call. If the limit cannot be checked (for example, the migration hasn't been run), login and contact requests are refused with a 503 rather than left unlimited.
- All writes must come from `APP_ORIGIN`.

## Production hosting

### Vercel (recommended)

The app keeps no files on its own disk, and uploads and images go directly between the browser and Supabase, so it runs well on Vercel.

1. Run `npm run migrate` and `npm run admin:setup` once from your own computer, with `.env.local` pointing at the production Supabase project.
2. Import the GitHub repository in Vercel. The framework preset is detected as Next.js; keep the default build settings.
3. In **Project → Settings → Environment Variables**, add:

   ```dotenv
   APP_ORIGIN=https://your-domain.example
   NEXT_PUBLIC_SUPABASE_URL=...
   SUPABASE_SERVICE_ROLE_KEY=...
   SUPABASE_STORAGE_BUCKET=portfolio-assets
   TRUST_PROXY=true
   ```

4. Deploy. If you change `NEXT_PUBLIC_SUPABASE_URL` later, **redeploy**: the address is built into the site's Content Security Policy at build time, and images won't load if it's out of date.

Notes:

- `APP_ORIGIN` must match the address visitors use exactly (for example `https://esaintmjay.com`, with no trailing slash). An `https://` value also turns on secure cookies. Writes from any other origin are rejected, so admin changes on a Vercel preview URL (`*.vercel.app`) will fail unless `APP_ORIGIN` is set to that URL for the preview environment.
- Vercel replaces `X-Forwarded-For` with the visitor's real IP, so `TRUST_PROXY=true` gives each visitor their own rate limit.
- `SUPABASE_ACCESS_TOKEN` and `DATABASE_URL` are only used by `npm run migrate` and are not needed on Vercel.

### Other Node hosts

Any host that runs `next start` also works, such as a VPS or a container. Set the same environment variables, then:

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
npm run typecheck
npm run build
npm test
```

Tests use Node's built-in runner; no testing package is required.

- `tests/security.test.ts` checks password hashing, validation, file-type detection and upload limits, and `tests/richtext.test.ts` checks that article content is cleaned of scripts, unsafe links and outside images. Both run offline.
- `tests/application.test.ts` starts the production build and exercises every route: login, cross-origin protection, uploads, draft media privacy, publishing, CV replacement, settings, articles, the inbox, rate limiting, deletion and password changes. **It erases all data in the configured Supabase project and replaces the admin account**, so it is skipped unless you point `.env.local` at a separate, disposable Supabase project and run:

  ```bash
  SUPABASE_TEST_PROJECT=true npm test
  ```

Browser visual and interaction QA still needs to be done by hand.

## Source structure

- `app/`: App Router pages and API routes.
- `app/api/admin/[[...path]]/`: protected CRUD and the two-step direct upload.
- `app/api/auth/`: login/logout.
- `app/api/contact/`: public enquiry submission.
- `app/media/[id]/`: publication-aware redirects to signed links for files in the private bucket.
- `app/work/[slug]/`: company galleries.
- `app/journal/`: article list and `[slug]` article pages.
- `app/sitemap.ts`, `app/robots.ts`: `/sitemap.xml` and `/robots.txt`.
- `components/ArticleEditor.tsx`: the admin article editor (Tiptap).
- `components/RichText.tsx`: renders article content on the site.
- `components/`: public and admin UI.
- `lib/supabase.ts`: typed server-side Supabase client and bucket name.
- `lib/database.types.ts`: Supabase table types (keep in sync with `scripts/migrate.sql`).
- `lib/types.ts`: shared app types.
- `lib/client.ts`: admin API and upload helpers for client components.
- `lib/richtext.ts`: article content format, sanitizer and text helpers.
- `lib/seo.ts`: URLs, descriptions and dates for metadata.
- `lib/db.ts`: settings, collections, assets, entries and storage helpers.
- `lib/security.ts`: sessions, passwords, validation, rate limits.
- `scripts/migrate.sql` and `scripts/run-migration.ts`: database schema and the `npm run migrate` runner.
- `scripts/admin.ts`: administrator setup and reset.
- `scripts/backup.ts`: local backup of tables and files.
- `tests/`: security and production-route checks.
