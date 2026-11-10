import { issuerSetupRuntime as h } from "@/lib/invoicing/issuer-setup-runtime.server";
export const runtime = "nodejs";
type Context = { params: Promise<{ uid: string }> };
export async function GET(r: Request, c: Context) {
  return h.get(r, (await c.params).uid);
}
export async function POST(r: Request, c: Context) {
  return h.save(r, (await c.params).uid);
}
