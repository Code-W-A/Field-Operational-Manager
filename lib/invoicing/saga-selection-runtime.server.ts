import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "@/lib/saga/service.server";
import { createSagaSelectionService } from "./saga-selection.server";
import { sagaSelectionHandlers } from "./saga-selection-http";
export const sagaSelectionService = createSagaSelectionService(
  adminDb,
  createSagaService(adminDb).readSituationForInvoice,
);
export const sagaSelectionRuntime = sagaSelectionHandlers(
  sagaSelectionService,
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
