import { mkdir, cp } from "node:fs/promises";
import path from "node:path";
import { backup } from "node:sqlite";
import { db, dataDir, uploadDir } from "../lib/db.mjs";
// Stop the application first, to keep the database and uploaded files consistent.
const destination = path.resolve(
  process.argv[2] ||
    `backups/${new Date().toISOString().replace(/[:.]/g, "-")}`,
);
if (destination === dataDir || destination.startsWith(dataDir + path.sep))
  throw new Error("Choose a backup folder outside DATA_DIR.");
await mkdir(destination, { recursive: true, mode: 0o700 });
await backup(db(), path.join(destination, "portfolio.sqlite"));
await cp(uploadDir, path.join(destination, "uploads"), {
  recursive: true,
  errorOnExist: true,
  force: false,
});
console.log(
  `Backup saved to ${destination}. Keep it private; it includes the account and enquiries.`,
);
