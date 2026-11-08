import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createInvoiceXmlService } from "./xml.server";
import { invoiceXmlHandlers } from "./xml-http";
export const invoiceXmlRuntime = invoiceXmlHandlers(
  createInvoiceXmlService(adminDb),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
