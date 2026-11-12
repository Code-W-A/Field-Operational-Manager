import { sagaSelectionRuntime as h } from "@/lib/invoicing/saga-selection-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  r: Request,
  context: { params: Promise<{ id: string }> },
) {
  return h.get(r, (await context.params).id);
}
export async function POST(
  r: Request,
  context: { params: Promise<{ id: string }> },
) {
  return h.refresh(r, (await context.params).id);
}
