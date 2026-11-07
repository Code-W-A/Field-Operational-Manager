import { catalogRuntime } from "@/lib/saga/catalog-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function PUT(
  request: Request,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  const { kind, id } = await context.params;
  return catalogRuntime.save(request, kind, id);
}
