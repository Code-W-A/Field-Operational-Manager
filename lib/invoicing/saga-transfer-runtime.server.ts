import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createInvoiceSagaService } from "./saga-transfer.server";
import { invoiceSagaHandlers } from "./saga-transfer-http";
export const invoiceSagaService = createInvoiceSagaService(adminDb);
export const invoiceSagaRuntime = invoiceSagaHandlers(invoiceSagaService, (r) =>
  requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
