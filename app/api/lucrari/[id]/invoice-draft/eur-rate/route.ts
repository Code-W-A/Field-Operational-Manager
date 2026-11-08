import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createEurRateService } from "@/lib/invoicing/eur-rate.server";
import { eurRateHandlers } from "@/lib/invoicing/eur-rate-http";
export const runtime = "nodejs";
export const maxDuration = 60;
const h = eurRateHandlers(createEurRateService(adminDb), (r) =>
  requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
export async function GET(r: Request, c: { params: Promise<{ id: string }> }) {
  return h.get(r, (await c.params).id);
}
