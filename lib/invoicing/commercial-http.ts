import { InvoiceDraftError } from "./draft";
import { SagaError } from "@/lib/saga/contracts";
import type { createCommercialService } from "./commercial.server";
export function commercialHandlers(
  service: ReturnType<typeof createCommercialService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const known = e instanceof InvoiceDraftError || e instanceof SagaError,
        err = e as { status?: number; code?: string };
      const status = known
        ? err.status || 400
        : [401, 403].includes(err.status || 0)
          ? err.status!
          : 503;
      return Response.json(
        {
          error: known
            ? (e as Error).message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces."
                : "Regulile comerciale nu sunt disponibile.",
          code: known ? err.code : "UNAVAILABLE",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(r: Request) {
    const raw = await r.text();
    if (Buffer.byteLength(raw) > 512 * 1024)
      throw new InvoiceDraftError("Cerere prea mare.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new InvoiceDraftError("Cerere invalidă.");
    }
  }
  return {
    policy: (r: Request) =>
      respond(async () => service.policy(await authenticate(r))),
    activate: (r: Request) =>
      respond(async () =>
        service.activate(await authenticate(r), await body(r)),
      ),
    binding: (r: Request, id: string) =>
      respond(async () => service.binding(await authenticate(r), id)),
    bind: (r: Request, id: string) =>
      respond(async () =>
        service.bind(await authenticate(r), id, await body(r)),
      ),
    context: (r: Request, id: string) =>
      respond(async () => service.context(await authenticate(r), id)),
    preview: (r: Request, id: string) =>
      respond(async () =>
        service.preview(await authenticate(r), id, await body(r)),
      ),
    products: (r: Request) =>
      respond(async () => {
        const q = new URL(r.url).searchParams;
        return service.products(await authenticate(r), {
          q: q.get("q") || "",
          field: q.get("field") || "code",
          cursor: q.get("cursor") || "",
        });
      }),
  };
}
