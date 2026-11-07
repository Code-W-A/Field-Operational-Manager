import { catalogRuntime } from "@/lib/saga/catalog-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return catalogRuntime.stock(request, (await context.params).id);
}
