import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createIssuerSetupService } from "./issuer-setup.server";
import { issuerSetupHandlers } from "./issuer-setup-http";
export const issuerSetupRuntime = issuerSetupHandlers(
  createIssuerSetupService(adminDb),
  (r) => requireVerifiedRole(["admin"], r as NextRequest),
);
