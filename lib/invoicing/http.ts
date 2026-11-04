import { InvoiceDraftError } from "./draft";
import type { createInvoiceDraftService, InvoiceActor } from "./service";
type Context = { params: Promise<{ id: string }> };
export function invoiceDraftHandlers(
  service: ReturnType<typeof createInvoiceDraftService>,
  authenticate: (request: Request) => Promise<InvoiceActor>,
) {
  const respond = async (run: () => Promise<unknown>) => {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const error = e as Error & { status?: number; code?: string };
      return Response.json(
        {
          error: error.status
            ? error.message
            : "La ciorna facturii a apărut o eroare. Reîncearcă.",
          code: error.code,
        },
        {
          status: error.status || 500,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  };
  return {
    GET: (request: Request, context: Context) =>
      respond(async () => {
        const actor = await authenticate(request);
        const { id } = await context.params;
        return service.get(
          id,
          actor,
          new URL(request.url).searchParams.get("source") === "1",
        );
      }),
    PUT: (request: Request, context: Context) =>
      respond(async () => {
        const actor = await authenticate(request);
        const { id } = await context.params;
        const raw = await request.text();
        if (raw.length > 200000)
          throw new InvoiceDraftError(
            "Ciorna depășește dimensiunea acceptată.",
          );
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new InvoiceDraftError("Cerere invalidă.");
        }
        return service.put(id, body, actor);
      }),
  };
}
