/**
 * app/api/calmify/route.ts
 * ---------------------------------------------------------
 * Receives articles published from Calmify. GET answers Calmify's
 * connection check; POST delivers a post, which lib/calmify.ts saves as a
 * site article at /journal/<slug>.
 *
 * Calmify authenticates with the CALMIFY_API_KEY header (see
 * @calmify/next). Set CALMIFY_API_KEY and CALMIFY_ASSET_HOST by running
 * `npx calmify-pair`, then add them to the host's environment and deploy.
 */
import { createCalmifyHandler } from "@calmify/next";
import { calmifyFind, calmifySave } from "../../../lib/calmify.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const { GET, POST } = createCalmifyHandler({
  findByKey: calmifyFind,
  save: calmifySave,
});
