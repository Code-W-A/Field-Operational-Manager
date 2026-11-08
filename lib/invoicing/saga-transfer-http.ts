import { SagaError } from "@/lib/saga/contracts";
import type { createInvoiceSagaService } from "./saga-transfer.server";
export function invoiceSagaHandlers(
  service: ReturnType<typeof createInvoiceSagaService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  const headers = { "Cache-Control": "private, no-store" };
  async function respond(
    run: () => Promise<unknown>,
    download = false,
    accepted = false,
  ) {
    try {
      const value = await run();
      if (download) {
        const v = value as { text: string; filename: string };
        return new Response(v.text, {
          headers: {
            ...headers,
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${v.filename}"`,
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return Response.json(value, { status: accepted ? 202 : 200, headers });
    } catch (e) {
      const error = e as Error & { status?: number; code?: string },
        known = e instanceof SagaError,
        status = known
          ? error.status!
          : [401, 403].includes(error.status || 0)
            ? error.status!
            : 503;
      return Response.json(
        {
          error: known
            ? error.message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces."
                : "Procesarea facturii nu este disponibilă momentan.",
          code: known ? error.code : "UNAVAILABLE",
        },
        { status, headers },
      );
    }
  }
  async function body(r: Request) {
    const text = await r.text();
    if (text.length > 4096)
      throw new SagaError("INVALID_INPUT", "Cerere prea mare.");
    try {
      return JSON.parse(text);
    } catch {
      throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    get: (r: Request, id: string) =>
      respond(async () => service.state(await authenticate(r), id)),
    start: (r: Request, id: string) =>
      respond(
        async () => service.start(await authenticate(r), id, await body(r)),
        false,
        true,
      ),
    recheck: (r: Request, id: string) =>
      respond(
        async () => service.recheck(await authenticate(r), id),
        false,
        true,
      ),
    report: (r: Request, id: string) =>
      respond(async () => service.report(await authenticate(r), id), true),
  };
}
