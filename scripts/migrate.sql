-- =============================================================
-- Esaint Mjay Portfolio — Supabase Database Migration
-- =============================================================
-- Run with `npm run migrate`, or paste this entire file into the
-- Supabase SQL Editor (Dashboard → SQL Editor → New query → Run).
-- Safe to run more than once.
-- =============================================================

-- ── settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS settings (
  id      INTEGER PRIMARY KEY CHECK (id = 1),
  data    JSONB   NOT NULL DEFAULT '{}'
);

-- ── admin (single row, id=1) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS admin (
  id       INTEGER PRIMARY KEY CHECK (id = 1),
  email    TEXT    NOT NULL,
  password TEXT    NOT NULL
);

-- ── sessions ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token   TEXT    PRIMARY KEY,
  expires BIGINT  NOT NULL
);

-- ── rate limiting ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS limits (
  key   TEXT    PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset BIGINT  NOT NULL
);

-- ── groups (portfolio collections) ───────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id          TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug        TEXT      UNIQUE NOT NULL,
  name        TEXT      NOT NULL,
  category    TEXT      NOT NULL DEFAULT '',
  description TEXT      NOT NULL DEFAULT '',
  year        TEXT      NOT NULL DEFAULT '',
  role        TEXT      NOT NULL DEFAULT '',
  published   BOOLEAN   NOT NULL DEFAULT false,
  featured    BOOLEAN   NOT NULL DEFAULT false,
  sort_order  INTEGER   NOT NULL DEFAULT 0,
  cover_id    TEXT      NOT NULL DEFAULT '',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── assets (images, CVs, portraits) ──────────────────────────
CREATE TABLE IF NOT EXISTS assets (
  id          TEXT    PRIMARY KEY DEFAULT gen_random_uuid()::text,
  group_id    TEXT    REFERENCES groups(id) ON DELETE CASCADE,
  kind        TEXT    NOT NULL,           -- 'work' | 'portrait' | 'cv'
  filename    TEXT    NOT NULL,           -- storage object path
  mime        TEXT    NOT NULL,
  bytes       INTEGER NOT NULL,
  title       TEXT    NOT NULL DEFAULT '',
  alt         TEXT    NOT NULL DEFAULT '',
  caption     TEXT    NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS assets_group ON assets (group_id, sort_order);

-- ── entries (services, awards, experience, articles) ──────────
CREATE TABLE IF NOT EXISTS entries (
  id          TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  kind        TEXT      NOT NULL,         -- 'service' | 'award' | 'experience' | 'article'
  title       TEXT      NOT NULL,
  subtitle    TEXT      NOT NULL DEFAULT '',
  body        TEXT      NOT NULL DEFAULT '',
  extra       TEXT      NOT NULL DEFAULT '',
  published   BOOLEAN   NOT NULL DEFAULT false,
  sort_order  INTEGER   NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS entries_kind ON entries (kind, sort_order);

-- ── messages (contact form submissions) ───────────────────────
CREATE TABLE IF NOT EXISTS messages (
  id          TEXT      PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name        TEXT      NOT NULL,
  email       TEXT      NOT NULL,
  subject     TEXT      NOT NULL,
  message     TEXT      NOT NULL,
  is_read     BOOLEAN   NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- =============================================================
-- Rate-limit atomic increment RPC
-- Called by lib/security.mjs → rateLimit()
-- =============================================================
CREATE OR REPLACE FUNCTION rate_limit_increment(p_key TEXT, p_period BIGINT)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_now   BIGINT := (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT;
BEGIN
  -- Delete expired entries
  DELETE FROM limits WHERE reset < v_now;

  -- Insert or increment
  INSERT INTO limits (key, count, reset)
  VALUES (p_key, 1, v_now + p_period)
  ON CONFLICT (key) DO UPDATE
    SET count = limits.count + 1
  RETURNING count INTO v_count;

  RETURN v_count;
END;
$$;

-- Only the server (service role) needs to count attempts; keep the public
-- anon key from calling the function at all.
REVOKE ALL ON FUNCTION rate_limit_increment(TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION rate_limit_increment(TEXT, BIGINT) TO service_role;


-- =============================================================
-- Row-Level Security (RLS)
-- All mutations happen via the service-role key (server-only),
-- so RLS primarily protects against leaked anon-key access.
-- =============================================================

ALTER TABLE settings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin     ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE limits    ENABLE ROW LEVEL SECURITY;
ALTER TABLE groups    ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages  ENABLE ROW LEVEL SECURITY;

-- Public read-only for published content (anon key is safe)
DROP POLICY IF EXISTS "public_groups_read" ON groups;
CREATE POLICY "public_groups_read"   ON groups   FOR SELECT USING (published = true);

DROP POLICY IF EXISTS "public_assets_read" ON assets;
CREATE POLICY "public_assets_read"   ON assets   FOR SELECT USING (
  group_id IN (SELECT id FROM groups WHERE published = true)
);

DROP POLICY IF EXISTS "public_entries_read" ON entries;
CREATE POLICY "public_entries_read"  ON entries  FOR SELECT USING (published = true);

DROP POLICY IF EXISTS "public_settings_read" ON settings;
CREATE POLICY "public_settings_read" ON settings FOR SELECT USING (true);

-- Everything else (admin, sessions, limits, messages) — blocked for anon
-- Service-role key bypasses RLS automatically ✓


-- =============================================================
-- Supabase Storage bucket (PRIVATE)
-- Files are never public: /media/[id] checks publication or admin
-- sign-in, then redirects to a link that expires after 10 minutes.
-- Keeping the bucket private means draft artwork cannot be reached.
-- =============================================================
-- The admin's browser uploads straight to this bucket using one-time
-- signed links, so the bucket also enforces the size and type limits
-- (15 MB, images and PDF). The app re-checks each file afterwards.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'portfolio-assets', 'portfolio-assets', false, 15728640,
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
