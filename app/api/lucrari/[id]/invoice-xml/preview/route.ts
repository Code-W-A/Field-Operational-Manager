import { invoiceXmlRuntime } from "@/lib/invoicing/xml-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function POST(r: Request, c: Context) {
  return invoiceXmlRuntime.preview(r, (await c.params).id);
}
