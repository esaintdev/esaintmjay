/**
 * scripts/admin.mjs
 * ---------------------------------------------------------
 * Interactive CLI to create or reset the portfolio administrator.
 * Uses the Supabase service-role key.
 *
 * Usage:
 *   npm run admin:setup
 */
import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";
import { supabase } from "../lib/supabase.mjs";
import { passwordHash, email } from "../lib/security.mjs";

const envEmail = process.env.ADMIN_EMAIL;
const envPassword = process.env.ADMIN_PASSWORD;

let prompt = null;

async function secret(label) {
  process.stdout.write(label);
  hidden = true;
  try {
    return await prompt.question("");
  } finally {
    hidden = false;
    process.stdout.write("\n");
  }
}

let hidden = false;

if (!envEmail || !envPassword) {
  if (!process.stdin.isTTY) {
    console.error("Run in an interactive terminal or set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.");
    process.exit(1);
  }
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!hidden) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  output.isTTY = true;
  prompt = createInterface({ input: process.stdin, output, terminal: true });
}

try {
  const { data: existing } = await supabase()
    .from("admin")
    .select("email")
    .eq("id", 1)
    .maybeSingle();

  console.log(
    existing ? "Reset portfolio administrator" : "Create portfolio administrator",
  );

  let address;
  let password;

  if (envEmail && envPassword) {
    address = email(envEmail);
    password = envPassword;
  } else {
    if (
      existing &&
      (await prompt.question(
        "This resets access and signs out all sessions. Type RESET to continue: ",
      )) !== "RESET"
    )
      throw new Error("Cancelled.");

    address = email(
      (await prompt.question(
        `Admin email${existing ? ` (${existing.email})` : ""}: `,
      )) || existing?.email,
    );
    password = await secret("Password (12+ characters): ");
    const confirm = await secret("Confirm password: ");
    if (password !== confirm) throw new Error("Passwords do not match.");
  }

  const hash = await passwordHash(password);

  // upsert admin record
  const { error: adminErr } = await supabase()
    .from("admin")
    .upsert({ id: 1, email: address, password: hash });
  if (adminErr) throw new Error(adminErr.message);

  // invalidate all sessions
  await supabase().from("sessions").delete().neq("token", "");
  await supabase().from("limits").delete().neq("key", "");

  console.log("Administrator saved. Open /admin to sign in.");
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  if (prompt) prompt.close();
}
