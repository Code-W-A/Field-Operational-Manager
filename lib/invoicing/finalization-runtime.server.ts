import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createInvoiceFinalizationService } from "./finalization.server";
import { invoiceFinalizationHandlers } from "./finalization-http";
export const invoiceFinalizationRuntime = invoiceFinalizationHandlers(
  createInvoiceFinalizationService(adminDb),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
