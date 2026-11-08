import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "./service.server";
import { createSagaReferencesService } from "./references.server";
import { sagaReferencesHandlers } from "./references-http";
const saga = createSagaService(adminDb);
export const sagaReferencesRuntime = sagaReferencesHandlers(
  createSagaReferencesService(adminDb, saga.read),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
