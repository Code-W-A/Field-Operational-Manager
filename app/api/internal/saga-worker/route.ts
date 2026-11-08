import { invoiceSagaService } from "@/lib/invoicing/saga-transfer-runtime.server";
import { workerAuthorized } from "@/lib/invoicing/saga-worker-auth.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(r: Request) {
  const headers = { "Cache-Control": "private, no-store" };
  if (!workerAuthorized(r))
    return Response.json({ error: "Nu ai acces." }, { status: 401, headers });
  try {
    const text = await r.text();
    if (text.length > 4096) throw new Error();
    const v = JSON.parse(text);
    if (typeof v.simulation !== "boolean" || typeof v.transferId !== "string")
      return Response.json(
        { error: "Cerere invalidă." },
        { status: 400, headers },
      );
    return Response.json(
      await invoiceSagaService.process(v.transferId, v.simulation),
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Procesarea necesită verificare." },
      { status: 503, headers },
    );
  }
}
