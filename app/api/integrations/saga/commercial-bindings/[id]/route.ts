import { commercialRuntime as h } from "@/lib/invoicing/commercial-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type C = { params: Promise<{ id: string }> };
export async function GET(r: Request, c: C) {
  return h.binding(r, (await c.params).id);
}
export async function PUT(r: Request, c: C) {
  return h.bind(r, (await c.params).id);
}
