import { commercialRuntime as h } from "@/lib/invoicing/commercial-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ id: string }> };
export async function POST(r: Request, c: C) {
  return h.preview(r, (await c.params).id);
}
