import { SagaError } from "@/lib/saga/contracts";
import { InvoiceDraftError } from "./draft";
import type { createInvoiceSagaArticleService } from "./saga-article.server";
export function invoiceSagaArticleHandlers(
  service: ReturnType<typeof createInvoiceSagaArticleService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  function handler(action: "preview" | "apply" | "stock") {
    return async (r: Request, workId: string) => {
      try {
        const actor = await authenticate(r);
        const raw = await r.text();
        if (Buffer.byteLength(raw) > 10000)
          throw new SagaError("INVALID_INPUT", "Cerere prea mare.");
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
        }
        return Response.json(await service[action](actor, workId, body), {
          headers: { "Cache-Control": "private, no-store" },
        });
      } catch (e) {
        const err = e as Error & { status?: number; code?: string };
        const known = e instanceof SagaError || e instanceof InvoiceDraftError;
        const status = known
          ? err.status || 400
          : [401, 403].includes(err.status || 0)
            ? err.status!
            : 503;
        return Response.json(
          {
            error: known
              ? err.message
              : status === 401
                ? "Autentificare necesară."
                : status === 403
                  ? "Nu ai acces."
                  : "Preluarea articolului nu este disponibilă momentan.",
            code: known ? err.code : "UNAVAILABLE",
          },
          { status, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    };
  }
  return {
    preview: handler("preview"),
    apply: handler("apply"),
    stock: handler("stock"),
  };
}
