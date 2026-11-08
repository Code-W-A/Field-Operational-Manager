import { EurRateError } from "./eur-rate";
import type { createEurRateService } from "./eur-rate.server";
export function eurRateHandlers(
  service: ReturnType<typeof createEurRateService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  return {
    get: async (r: Request, id: string) => {
      try {
        const actor = await authenticate(r),
          date = new URL(r.url).searchParams.get("date") || "";
        return Response.json(await service.get(actor, id, date), {
          headers: { "Cache-Control": "private, no-store" },
        });
      } catch (e) {
        const known = e instanceof EurRateError,
          err = e as { status?: number };
        const status = known
          ? e.status
          : [401, 403].includes(err.status || 0)
            ? err.status!
            : 503;
        return Response.json(
          {
            error: known
              ? e.message
              : status === 401
                ? "Autentificare necesară."
                : status === 403
                  ? "Nu ai acces."
                  : "Cursul EUR nu este disponibil.",
            code: known ? e.code : "EUR_RATE_UNAVAILABLE",
          },
          { status, headers: { "Cache-Control": "private, no-store" } },
        );
      }
    },
  };
}
