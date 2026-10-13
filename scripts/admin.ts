/**
 * scripts/admin.ts
 * ---------------------------------------------------------
 * Interactive CLI to create or reset the portfolio administrator.
 * Uses the Supabase service-role key.
 *
 * Usage:
 *   npm run admin:setup
 */
import { createInterface, type Interface } from "node:readline/promises";
import { Writable } from "node:stream";
import { supabase } from "../lib/supabase.ts";
import { passwordHash, email } from "../lib/security.ts";

const envEmail = process.env.ADMIN_EMAIL;
const envPassword = process.env.ADMIN_PASSWORD;

let prompt: Interface | null = null;
let hidden = false;

function ask(label: string): Promise<string> {
  if (!prompt) throw new Error("No interactive terminal.");
  return prompt.question(label);
}

async function secret(label: string): Promise<string> {
  process.stdout.write(label);
  hidden = true;
  try {
    return await ask("");
  } finally {
    hidden = false;
    process.stdout.write("\n");
  }
}

if (!envEmail || !envPassword) {
  if (!process.stdin.isTTY) {
    console.error(
      "Run in an interactive terminal or set ADMIN_EMAIL and ADMIN_PASSWORD environment variables.",
    );
    process.exit(1);
  }
  const output = new Writable({
    write(
      chunk: Buffer | string,
      encoding: BufferEncoding,
      callback: () => void,
    ) {
      if (!hidden) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  Object.assign(output, { isTTY: true });
  prompt = createInterface({ input: process.stdin, output, terminal: true });
}

try {
  const { data: existing } = await supabase()
    .from("admin")
    .select("email")
    .eq("id", 1)
    .maybeSingle();

  console.log(
    existing
      ? "Reset portfolio administrator"
      : "Create portfolio administrator",
  );

  let address: string;
  let password: string;

  if (envEmail && envPassword) {
    address = email(envEmail);
    password = envPassword;
  } else {
    if (
      existing &&
      (await ask(
        "This resets access and signs out all sessions. Type RESET to continue: ",
      )) !== "RESET"
    )
      throw new Error("Cancelled.");

    address = email(
      (await ask(`Admin email${existing ? ` (${existing.email})` : ""}: `)) ||
        existing?.email,
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
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  prompt?.close();
}
