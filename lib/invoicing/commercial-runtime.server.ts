import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createCommercialService } from "./commercial.server";
import { commercialHandlers } from "./commercial-http";
export const commercialRuntime = commercialHandlers(
  createCommercialService(adminDb),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
