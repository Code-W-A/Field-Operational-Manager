import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaClientsService } from "./clients.server";
import { sagaClientsHandlers } from "./clients-http";
export const clientsRuntime = sagaClientsHandlers(
  createSagaClientsService(adminDb),
  (request) =>
    requireVerifiedRole(["admin", "dispecer"], request as NextRequest),
);
