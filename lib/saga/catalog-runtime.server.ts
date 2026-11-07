import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "./service.server";
import { createSagaCatalogService } from "./catalog.server";
import { sagaCatalogHandlers } from "./catalog-http";
export const catalogRuntime = sagaCatalogHandlers(
  createSagaCatalogService(adminDb, createSagaService(adminDb).readForInvoice),
  (request) =>
    requireVerifiedRole(["admin", "dispecer"], request as NextRequest),
);
