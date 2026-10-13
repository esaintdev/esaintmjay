/**
 * lib/client.ts
 * ---------------------------------------------------------
 * Small helpers for client components.
 */

/** A readable message for anything caught in a try/catch. */
export const errorMessage = (e: unknown): string =>
  e instanceof Error ? e.message : "Something went wrong. Please try again.";
