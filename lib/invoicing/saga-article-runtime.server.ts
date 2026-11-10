import "server-only";
import type { NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { requireVerifiedRole } from "@/lib/auth/require-role";
import { createSagaService } from "@/lib/saga/service.server";
import { createInvoiceSagaArticleService } from "./saga-article.server";
import { invoiceSagaArticleHandlers } from "./saga-article-http";
export const invoiceSagaArticleRuntime = invoiceSagaArticleHandlers(
  createInvoiceSagaArticleService(
    adminDb,
    createSagaService(adminDb).readForInvoice,
  ),
  (r) => requireVerifiedRole(["admin", "dispecer"], r as NextRequest),
);
