import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createInvoiceDraftService } from "@/lib/invoicing/service";
import { invoiceDraftHandlers } from "@/lib/invoicing/http";
export const runtime = "nodejs";
const handlers = invoiceDraftHandlers(
  createInvoiceDraftService(adminDb),
  (request) =>
    requireVerifiedRole(["admin", "dispecer"], request as NextRequest),
);
export const GET = handlers.GET;
export const PUT = handlers.PUT;
