import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "@/lib/saga/service.server";
import { createInvoiceSagaArticleService } from "./saga-article.server";
import { invoiceSagaArticleHandlers } from "./saga-article-http";
import { sagaSelectionService } from "./saga-selection-runtime.server";
export const invoiceSagaArticleRuntime = invoiceSagaArticleHandlers(
  createInvoiceSagaArticleService(
    adminDb,
    createSagaService(adminDb).readForInvoice,
    undefined,
    undefined,
    sagaSelectionService,
  ),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
