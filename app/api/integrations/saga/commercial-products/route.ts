import { commercialRuntime as h } from "@/lib/invoicing/commercial-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(r: Request) {
  return h.products(r);
}
