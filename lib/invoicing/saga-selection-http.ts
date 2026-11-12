import { SagaError } from "@/lib/saga/contracts";
import type { createSagaSelectionService } from "./saga-selection.server";
export function sagaSelectionHandlers(
  service: ReturnType<typeof createSagaSelectionService>,
  authenticate: (request: Request) => Promise<{ uid: string; role: string }>,
) {
  async function handle(request: Request, workId: string) {
    try {
      const actor = await authenticate(request);
      const url = new URL(request.url);
      const result = await service.list(
        actor,
        workId,
        {
          type: url.searchParams.get("type") || "",
          warehouse: url.searchParams.get("warehouse") || "",
          q: url.searchParams.get("q") || "",
          offset: url.searchParams.get("offset") || "0",
        },
        request.method === "POST",
      );
      return Response.json(result, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const error = e as { status?: number };
      const status =
        e instanceof SagaError
          ? e.status
          : [401, 403].includes(error.status || 0)
            ? error.status!
            : 503;
      return Response.json(
        {
          error:
            e instanceof SagaError
              ? e.message
              : "Lista SAGA nu poate fi încărcată momentan.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  return { get: handle, refresh: handle };
}
