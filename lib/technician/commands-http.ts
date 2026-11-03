import {
  FOM_CONTRACT_VERSION,
  attendanceAction,
  assertCommand,
} from "@/packages/fom-domain";
import { NextRequest, NextResponse } from "next/server";
import { service, mobileAccess, headers, failure } from "./http";
export function commandHandler(
  channel: "web" | "mobile",
  resolveActor: (
    request: NextRequest,
  ) => Promise<import("@/packages/fom-domain").Actor>,
) {
  return async function POST(request: NextRequest) {
    try {
      const a = await resolveActor(request);
      const raw = await request.text();
      if (raw.length > 900000)
        return NextResponse.json(
          { error: "Comanda este prea mare.", kind: "validation" },
          { status: 413, headers: headers(request) },
        );
      const command = JSON.parse(raw);
      if (channel === "mobile") {
        assertCommand(command);
        await mobileAccess.requireAccess(
          a.uid,
          !attendanceAction(command.action) && !command.offlineWork,
        );
      }
      const result = await service.command(a.uid, command, channel);
      // Attendance never creates a delivery effect. Avoid its extra transaction and
      // loading document/email modules on this latency-sensitive path.
      const delivery = attendanceAction(command.action) ? undefined :
        command.action === "installation" &&
        command.payload.action === "complete"
          ? await (await import("@/lib/installations/delivery.server")).sendInstallationCompletion(
              request,
              command.entityId,
              result.document?.deliveryEffectId,
            )
          : await (await import("./effects")).dispatchEffect(request, a.uid, command.mutationId);
      return NextResponse.json(
        {
          ...result,
          contractVersion: FOM_CONTRACT_VERSION,
          ...(delivery ? { delivery } : {}),
        },
        { headers: headers(request) },
      );
    } catch (e) {
      return failure(request, e);
    }
  };
}
