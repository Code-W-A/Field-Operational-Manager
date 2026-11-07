import { clientsRuntime } from "@/lib/saga/clients-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return clientsRuntime.forWork(request, (await context.params).id);
}
