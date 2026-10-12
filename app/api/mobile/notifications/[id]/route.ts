import { NextRequest } from "next/server";
import {
  notifications,
  notificationActor,
  notificationResponse,
} from "@/lib/notifications/http";
import { failure, options, mobileAccess } from "@/lib/technician/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const a = await notificationActor(request);
    const access = await mobileAccess.status(a.uid);
    return notificationResponse(request, {
      ...(await notifications.open(a.uid, (await context.params).id, a)),
      attendanceActive: !!access.activeSessionId,
    });
  } catch (error) {
    return failure(request, error);
  }
}
