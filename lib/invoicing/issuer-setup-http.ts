import { SagaError } from "@/lib/saga/contracts";
import { InvoiceNumberingError } from "./numbering";
import type { createIssuerSetupService } from "./issuer-setup.server";
export function issuerSetupHandlers(
  service: ReturnType<typeof createIssuerSetupService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  const handler =
    (action: "get" | "preview" | "save") => async (r: Request, uid: string) => {
      const headers = { "Cache-Control": "private, no-store" };
      try {
        const actor = await authenticate(r);
        let input;
        if (action !== "get") {
          const raw = await r.text();
          if (Buffer.byteLength(raw) > 10000)
            throw new SagaError("INVALID_INPUT", "Cerere prea mare.");
          try {
            input = JSON.parse(raw);
          } catch {
            throw new SagaError("INVALID_INPUT", "Cerere invalidă.");
          }
        }
        return Response.json(await service[action](actor, uid, input), {
          headers,
        });
      } catch (e) {
        const err = e as Error & { status?: number; code?: string },
          known = e instanceof SagaError || e instanceof InvoiceNumberingError,
          status = known
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
                  : "Configurarea facturării nu este disponibilă momentan.",
            code: known ? err.code : "UNAVAILABLE",
          },
          { status, headers },
        );
      }
    };
  return {
    get: handler("get"),
    preview: handler("preview"),
    save: handler("save"),
  };
}
