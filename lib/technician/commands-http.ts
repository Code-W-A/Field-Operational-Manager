import { FOM_CONTRACT_VERSION } from "@/packages/fom-domain";
import { dispatchEffect } from "./effects";
import { NextRequest, NextResponse } from "next/server";
import {

  service,
  headers,
  failure,

} from "./http";
export function commandHandler(channel: "web" | "mobile", resolveActor: (request: NextRequest) => Promise<import("@/packages/fom-domain").Actor>) {
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
    const result = await service.command(a.uid, command, channel);
    const delivery = await dispatchEffect(request, a.uid, command.mutationId);
    return NextResponse.json(
      { ...result, contractVersion: FOM_CONTRACT_VERSION, ...(delivery ? { delivery } : {}) },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}

}
