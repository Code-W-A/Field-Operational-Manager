import { commercialRuntime as h } from "@/lib/invoicing/commercial-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ id: string }> };
export async function GET(r: Request, c: C) {
  return h.context(r, (await c.params).id);
}
