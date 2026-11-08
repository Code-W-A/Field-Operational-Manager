import { numberingRuntime } from "@/lib/invoicing/numbering-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  r: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  return numberingRuntime.estimate(r, (await ctx.params).id);
}
