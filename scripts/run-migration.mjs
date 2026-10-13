#!/usr/bin/env node
/**
 * scripts/run-migration.mjs
 * Executes migrate.sql against Supabase.
 * Supports:
 *   1. Supabase Management API via SUPABASE_ACCESS_TOKEN (recommended, bypasses IPv6 / firewall issues)
 *   2. Direct PostgreSQL connection via DATABASE_URL
 */
import { readFileSync } from "node:fs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const token = process.env.SUPABASE_ACCESS_TOKEN;
const dbUrl = process.env.DATABASE_URL;

const bucket = process.env.SUPABASE_STORAGE_BUCKET || "portfolio-assets";
if (!/^[a-z0-9][a-z0-9._-]{1,62}$/.test(bucket)) {
  console.error("SUPABASE_STORAGE_BUCKET may only contain lowercase letters, numbers, dots, hyphens and underscores.");
  process.exit(1);
}
const sql = readFileSync(new URL("./migrate.sql", import.meta.url), "utf8")
  .replaceAll("'portfolio-assets'", `'${bucket}'`);

if (token && url) {
  const match = url.match(/https:\/\/([^.]+)\./);
  const ref = match ? match[1] : null;

  if (ref) {
    console.log(`Executing migration via Supabase Management API for project ${ref}...`);
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("Migration failed:", err);
      process.exit(1);
    }

    console.log("Migration executed successfully via Supabase Management API.");
    process.exit(0);
  }
}

if (dbUrl) {
  console.log("Executing migration via DATABASE_URL...");
  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("Migration executed successfully via direct database connection.");
    process.exit(0);
  } catch (err) {
    console.error("Migration via direct connection failed:", err.message);
    process.exit(1);
  }
}

console.error("Please provide SUPABASE_ACCESS_TOKEN or DATABASE_URL in .env.local to run migrations.");
process.exit(1);
