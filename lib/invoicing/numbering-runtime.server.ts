import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createInvoiceNumberingService } from "./numbering.server";
import { numberingHandlers } from "./numbering-http";
export const numberingRuntime = numberingHandlers(
  createInvoiceNumberingService(adminDb),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
