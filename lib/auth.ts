import { cookies } from "next/headers";
import { COOKIE, validSession, HttpError } from "./security.ts";

export async function authenticated(): Promise<boolean> {
  return validSession((await cookies()).get(COOKIE)?.value);
}

export async function requireAdmin(): Promise<void> {
  if (!(await authenticated()))
    throw new HttpError("Please sign in to continue.", 401);
}
