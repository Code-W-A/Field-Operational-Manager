import { SagaError } from "@/lib/saga/contracts";
import { InvoiceXmlError } from "./xml";
import { InvoiceDraftError } from "./draft";
import { InvoiceNumberingError } from "./numbering";
import { EurRateError } from "./eur-rate";
import type { createInvoiceFinalizationService } from "./finalization.server";
export function invoiceFinalizationHandlers(
  service: ReturnType<typeof createInvoiceFinalizationService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  const handler =
    (action: "preview" | "confirm") => async (r: Request, workId: string) => {
      const headers = { "Cache-Control": "private, no-store" };
      try {
        const actor = await authenticate(r),
          raw = await r.text();
        if (Buffer.byteLength(raw) > 10000)
          throw new SagaError("INVALID_INPUT", "Cerere prea mare.");
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
        }
        return Response.json(await service[action](actor, workId, body), {
          status: action === "confirm" ? 202 : 200,
          headers,
        });
      } catch (e) {
        const err = e as Error & { status?: number; code?: string },
          known =
            e instanceof SagaError ||
            e instanceof InvoiceXmlError ||
            e instanceof InvoiceDraftError ||
            e instanceof InvoiceNumberingError ||
            e instanceof EurRateError;
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
                  : "Finalizarea nu este disponibilă momentan. Datele sunt păstrate; verifică progresul înainte de reîncercare.",
            code: known ? err.code : "UNAVAILABLE",
          },
          { status, headers },
        );
      }
    };
  return { preview: handler("preview"), confirm: handler("confirm") };
}
