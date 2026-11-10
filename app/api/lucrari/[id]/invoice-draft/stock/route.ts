import { invoiceSagaArticleRuntime } from "@/lib/invoicing/saga-article-runtime.server";
import { catalogRuntime } from "@/lib/saga/catalog-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const input = await request
    .clone()
    .json()
    .catch(() => null);
  if (input && Object.prototype.hasOwnProperty.call(input, "previewId"))
    return invoiceSagaArticleRuntime.stock(request, (await context.params).id);
  return catalogRuntime.stock(request, (await context.params).id);
}
