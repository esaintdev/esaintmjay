/**
 * scripts/backup.ts
 * ---------------------------------------------------------
 * Copies every portfolio table (as JSON) and every file in the storage
 * bucket from Supabase to a local folder.
 *
 * Usage:
 *   npm run backup
 *   npm run backup -- /absolute/path/to/backup
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase, BUCKET } from "../lib/supabase.ts";

const tables = [
  "settings",
  "admin",
  "groups",
  "assets",
  "entries",
  "messages",
] as const;
const page = 1000;

const destination = path.resolve(
  process.argv[2] ||
    `backups/${new Date().toISOString().replace(/[:.]/g, "-")}`,
);

async function allRows(table: (typeof tables)[number]): Promise<unknown[]> {
  // rows are copied as-is, so the untyped client is fine here
  const db = supabase() as unknown as SupabaseClient;
  const rows: unknown[] = [];
  for (let from = 0; ; from += page) {
    const { data, error } = await db
      .from(table)
      .select("*")
      .range(from, from + page - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < page) return rows;
  }
}

async function allFiles(): Promise<string[]> {
  const names: string[] = [];
  for (let offset = 0; ; offset += page) {
    const { data, error } = await supabase()
      .storage.from(BUCKET)
      .list("", {
        limit: page,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
    if (error) throw new Error(`storage: ${error.message}`);
    // folders have no id; uploads are stored flat at the bucket root
    names.push(...data.filter((f) => f.id).map((f) => f.name));
    if (data.length < page) return names;
  }
}

try {
  await mkdir(path.join(destination, "tables"), {
    recursive: true,
    mode: 0o700,
  });
  await mkdir(path.join(destination, "files"), {
    recursive: true,
    mode: 0o700,
  });

  for (const table of tables) {
    const rows = await allRows(table);
    await writeFile(
      path.join(destination, "tables", `${table}.json`),
      JSON.stringify(rows, null, 2),
      { mode: 0o600 },
    );
    console.log(`✓ ${table}: ${rows.length} rows`);
  }

  const files = await allFiles();
  for (const name of files) {
    const { data, error } = await supabase()
      .storage.from(BUCKET)
      .download(name);
    if (error) throw new Error(`${name}: ${error.message}`);
    await writeFile(
      path.join(destination, "files", path.basename(name)),
      Buffer.from(await data.arrayBuffer()),
      { mode: 0o600 },
    );
  }
  console.log(`✓ files: ${files.length}`);

  console.log(
    `Backup saved to ${destination}. Keep it private; it includes the account hash and enquiries.`,
  );
} catch (e) {
  console.error("Backup failed:", e instanceof Error ? e.message : e);
  process.exitCode = 1;
}
