import { InvoiceNumberingError } from "./numbering";
import { SagaError } from "@/lib/saga/contracts";
import type { createInvoiceNumberingService } from "./numbering.server";
export function numberingHandlers(
  service: ReturnType<typeof createInvoiceNumberingService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  async function respond(run: () => Promise<unknown>) {
    try {
      return Response.json(await run(), {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const err = e as Error & { status?: number };
      const known =
        e instanceof InvoiceNumberingError || e instanceof SagaError;
      const status = known
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
                : "Numerotarea nu este disponibilă momentan.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(r: Request) {
    const raw = await r.text();
    if (raw.length > 5000)
      throw new InvoiceNumberingError(
        "INVALID_INPUT",
        "Cererea este prea mare.",
      );
    try {
      return JSON.parse(raw);
    } catch {
      throw new InvoiceNumberingError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    usersList: (r: Request) =>
      respond(async () =>
        service.users.list(
          await authenticate(r),
          new URL(r.url).searchParams.get("cursor") || "",
        ),
      ),
    usersPreview: (r: Request) =>
      respond(async () =>
        service.users.preview(await authenticate(r), await body(r)),
      ),
    usersActivate: (r: Request) =>
      respond(async () =>
        service.users.activate(await authenticate(r), await body(r)),
      ),
    get: (r: Request) =>
      respond(async () => service.get(await authenticate(r))),
    preview: (r: Request) =>
      respond(async () =>
        service.preview(await authenticate(r), await body(r)),
      ),
    put: (r: Request) =>
      respond(async () => service.put(await authenticate(r), await body(r))),
    estimate: (r: Request, workId: string) =>
      respond(async () => service.estimate(await authenticate(r), workId)),
  };
}
