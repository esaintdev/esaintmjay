#!/usr/bin/env node
/**
 * scripts/migrate-via-api.mjs
 * Runs the migration by calling Supabase's built-in SQL execution
 * via pg_meta (available on all hosted Supabase projects).
 */
import { readFileSync } from "node:fs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ref = SUPABASE_URL.match(/https:\/\/([^.]+)\./)[1];

const headers = {
  "Content-Type": "application/json",
  "X-Supabase-Service-Role-Key": SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  apikey: SERVICE_KEY,
};

async function runSQL(query) {
  // Use pg-meta endpoint which is available on all Supabase projects
  const res = await fetch(
    `https://${ref}.supabase.co/pg/query`,
    {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    }
  );

  if (!res.ok) {
    const txt = await res.text();
    // Try alternative endpoint
    const res2 = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec`, {
      method: "POST",
      headers,
      body: JSON.stringify({ sql: query }),
    });
    if (!res2.ok) {
      const txt2 = await res2.text();
      return { error: txt2, status: res2.status };
    }
    return { ok: true };
  }
  return { ok: true, data: await res.json() };
}

// Parse SQL into individual statements
const sql = readFileSync(new URL("./migrate.sql", import.meta.url), "utf8");

// Remove comment lines and split by semicolons
const statements = sql
  .replace(/--[^\n]*/g, "") // strip inline comments
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 10);

console.log(`Running ${statements.length} statements against ${SUPABASE_URL}\n`);

for (const stmt of statements) {
  const preview = stmt.slice(0, 70).replace(/\s+/g, " ");
  const result = await runSQL(stmt + ";");
  if (result.error) {
    console.error(`✗ FAILED: ${preview}`);
    console.error(`  Error: ${result.error.slice(0, 200)}`);
  } else {
    console.log(`✓ ${preview}`);
  }
}

console.log("\nDone.");
