import { cookies } from "next/headers";
import { COOKIE, validSession, HttpError } from "./security.mjs";

export async function authenticated() {
  return validSession((await cookies()).get(COOKIE)?.value);
}

export async function requireAdmin() {
  if (!(await authenticated()))
    throw new HttpError("Please sign in to continue.", 401);
}
