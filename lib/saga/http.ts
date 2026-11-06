import { SagaError } from "./contracts";
import type { createSagaService } from "./service.server";
export function sagaHandlers(
  service: ReturnType<typeof createSagaService>,
  authenticate: (request: Request) => Promise<{ uid: string; role: string }>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const error = e as Error & { status?: number };
      const known = e instanceof SagaError;
      const status = known
        ? e.status
        : [401, 403].includes(error.status || 0)
          ? error.status!
          : 503;
      return Response.json(
        {
          code: known
            ? e.code
            : status === 401
              ? "UNAUTHENTICATED"
              : status === 403
                ? "FORBIDDEN"
                : "UNAVAILABLE",
          error: known
            ? e.message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces la integrarea SAGA."
                : "Integrarea SAGA nu este disponibilă momentan. Reîncearcă.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  return {
    status: (request: Request) =>
      respond(async () => service.status(await authenticate(request))),
    read: (request: Request) =>
      respond(async () => {
        const actor = await authenticate(request),
          raw = await request.text();
        if (raw.length > 2000)
          throw new SagaError(
            "INVALID_INPUT",
            "Cererea depășește dimensiunea acceptată.",
          );
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
        }
        return service.read(actor, body);
      }),
  };
}
