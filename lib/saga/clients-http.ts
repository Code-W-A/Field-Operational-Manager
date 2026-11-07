import { SagaError } from "./contracts";
import type { createSagaClientsService } from "./clients.server";
type Actor = { uid: string; role: string };
export function sagaClientsHandlers(
  service: ReturnType<typeof createSagaClientsService>,
  authenticate: (r: Request) => Promise<Actor>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const err = e as Error & { status?: number; code?: string };
      const known = e instanceof SagaError,
        status = known
          ? e.status
          : [401, 403].includes(err.status || 0)
            ? err.status!
            : 503;
      return Response.json(
        {
          code: known ? e.code : "UNAVAILABLE",
          error: known
            ? e.message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces."
                : "Asocierea clienților nu este disponibilă momentan. Reîncearcă.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(r: Request) {
    const raw = await r.text();
    if (Buffer.byteLength(raw) > 10 * 1024 * 1024)
      throw new SagaError("INVALID_INPUT", "Cererea depășește 10 MB.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    preview: (r: Request) =>
      respond(async () =>
        service.preview(await authenticate(r), await body(r)),
      ),
    search: (r: Request) =>
      respond(async () => {
        const q = new URL(r.url).searchParams;
        return service.search(
          await authenticate(r),
          q.get("q") || "",
          q.get("country") || "",
          q.get("mode") === "tax",
        );
      }),
    begin: (r: Request) =>
      respond(async () => service.begin(await authenticate(r), await body(r))),
    progress: (r: Request) =>
      respond(async () =>
        service.progress(
          await authenticate(r),
          new URL(r.url).searchParams.get("id") || undefined,
        ),
      ),
    batch: (r: Request, id: string) =>
      respond(async () =>
        service.batch(await authenticate(r), id, await body(r)),
      ),
    cancel: (r: Request, id: string) =>
      respond(async () => service.cancel(await authenticate(r), id)),
    association: (r: Request, id: string) =>
      respond(async () => service.association(await authenticate(r), id)),
    link: (r: Request, id: string) =>
      respond(async () =>
        service.link(await authenticate(r), id, await body(r)),
      ),
    forWork: (r: Request, id: string) =>
      respond(async () => service.forWork(await authenticate(r), id)),
  };
}
