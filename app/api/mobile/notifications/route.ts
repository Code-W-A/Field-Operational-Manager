import { NextRequest } from "next/server";
import {
  notifications,
  notificationActor,
  notificationResponse,
} from "@/lib/notifications/http";
import { failure, options } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(request: NextRequest) {
  try {
    const a = await notificationActor(request);
    return notificationResponse(
      request,
      await notifications.list(
        a.uid,
        request.nextUrl.searchParams.get("cursor") || undefined,
      ),
    );
  } catch (error) {
    return failure(request, error);
  }
}
