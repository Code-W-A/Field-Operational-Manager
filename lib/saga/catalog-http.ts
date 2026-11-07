import { SagaError } from "./contracts";
import type { createSagaCatalogService } from "./catalog.server";
type Actor = { uid: string; role: string };
export function sagaCatalogHandlers(
  service: ReturnType<typeof createSagaCatalogService>,
  authenticate: (request: Request) => Promise<Actor>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const error = e as { status?: number; code?: string; message?: string };
      const status =
        e instanceof SagaError
          ? e.status
          : [401, 403].includes(error.status || 0)
            ? error.status!
            : 503;
      return Response.json(
        {
          code: error.code || "UNAVAILABLE",
          error:
            e instanceof SagaError
              ? e.message
              : status === 401
                ? "Autentificare necesară."
                : status === 403
                  ? "Nu ai acces."
                  : "Catalogul SAGA nu este disponibil momentan.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(request: Request) {
    const raw = await request.text();
    if (raw.length > 20000)
      throw new SagaError("INVALID_INPUT", "Cererea este prea mare.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    list: (r: Request) =>
      respond(async () => service.list(await authenticate(r))),
    save: (r: Request, kind: string, id?: string) =>
      respond(async () =>
        service.save(await authenticate(r), kind, await body(r), id),
      ),
    stock: (r: Request, id: string) =>
      respond(async () =>
        service.stock(await authenticate(r), id, await body(r)),
      ),
  };
}
