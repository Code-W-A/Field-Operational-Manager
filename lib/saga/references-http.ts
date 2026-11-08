import { SagaError } from "./contracts";
import type { createSagaReferencesService } from "./references.server";
type Actor = { uid: string; role: string };
export function sagaReferencesHandlers(
  service: ReturnType<typeof createSagaReferencesService>,
  authenticate: (r: Request) => Promise<Actor>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const error = e as { status?: number },
        known = e instanceof SagaError,
        status = known
          ? e.status
          : [401, 403].includes(error.status || 0)
            ? error.status!
            : 503;
      return Response.json(
        {
          error: known
            ? e.message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces."
                : "Datele de referință nu sunt disponibile momentan.",
          code: known ? e.code : "UNAVAILABLE",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(r: Request) {
    const raw = await r.text();
    if (Buffer.byteLength(raw, "utf8") > 10 * 1024 * 1024)
      throw new SagaError("INVALID_INPUT", "Cererea depășește 10 MB.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    list: (r: Request, kind: string) =>
      respond(async () => {
        const q = new URL(r.url).searchParams;
        return service.list(await authenticate(r), kind, {
          q: q.get("q") || "",
          field: q.get("field") || "code",
          cursor: q.get("cursor") || "",
          limit: q.get("limit") || "25",
        });
      }),
    preview: (r: Request, kind: string) =>
      respond(async () =>
        service.preview(await authenticate(r), kind, await body(r)),
      ),
    begin: (r: Request, kind: string) =>
      respond(async () =>
        service.begin(await authenticate(r), kind, await body(r)),
      ),
    progress: (r: Request, kind: string) =>
      respond(async () =>
        service.progress(
          await authenticate(r),
          kind,
          new URL(r.url).searchParams.get("id") || undefined,
        ),
      ),
    batch: (r: Request, kind: string, id: string) =>
      respond(async () =>
        service.batch(await authenticate(r), kind, id, await body(r)),
      ),
    cancel: (r: Request, kind: string, id: string) =>
      respond(async () => service.cancel(await authenticate(r), kind, id)),
    verify: (r: Request, kind: string, id: string) =>
      respond(async () => {
        const actor = await authenticate(r);
        if (kind !== "articles")
          throw new SagaError(
            "INVALID_REFERENCE",
            "Se pot verifica online doar articolele cunoscute.",
          );
        return service.verify(actor, id, await body(r));
      }),
    users: (r: Request) =>
      respond(async () =>
        service.users(
          await authenticate(r),
          new URL(r.url).searchParams.get("cursor") || "",
        ),
      ),
    profile: (r: Request, uid: string) =>
      respond(async () => service.profile(await authenticate(r), uid)),
    saveProfile: (r: Request, uid: string) =>
      respond(async () =>
        service.saveProfile(await authenticate(r), uid, await body(r)),
      ),
  };
}
