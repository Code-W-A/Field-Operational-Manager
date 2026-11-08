import { invoiceSagaRuntime } from "@/lib/invoicing/saga-transfer-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(r: Request, c: Context) {
  return invoiceSagaRuntime.report(r, (await c.params).id);
}
