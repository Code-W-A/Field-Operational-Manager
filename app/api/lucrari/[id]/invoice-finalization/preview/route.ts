import { invoiceFinalizationRuntime as h } from "@/lib/invoicing/finalization-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  r: Request,
  context: { params: Promise<{ id: string }> },
) {
  return h.preview(r, (await context.params).id);
}
