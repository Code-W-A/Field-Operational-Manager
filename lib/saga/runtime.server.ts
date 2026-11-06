import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "./service.server";
import { sagaHandlers } from "./http";
export const sagaRuntime = sagaHandlers(createSagaService(adminDb), (request) =>
  requireVerifiedRole(["admin"], request as NextRequest),
);
