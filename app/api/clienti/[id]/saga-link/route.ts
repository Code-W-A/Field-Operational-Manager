import { clientsRuntime } from "@/lib/saga/clients-runtime.server";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return clientsRuntime.association(request, (await context.params).id);
}
export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return clientsRuntime.link(request, (await context.params).id);
}
