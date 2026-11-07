import { clientsRuntime } from "@/lib/saga/clients-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return clientsRuntime.cancel(request, (await context.params).id);
}
