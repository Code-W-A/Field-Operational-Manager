import { invoiceXmlRuntime } from "@/lib/invoicing/xml-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };
export async function GET(r: Request, c: Context) {
  return invoiceXmlRuntime.document(r, (await c.params).id);
}
export async function POST(r: Request, c: Context) {
  return invoiceXmlRuntime.prepare(r, (await c.params).id);
}
