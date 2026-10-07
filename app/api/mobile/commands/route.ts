import { dispatchEffect } from "@/lib/mobile/effects";
import { NextRequest, NextResponse } from "next/server";
import {
  mobileActor,
  service,
  headers,
  failure,
  options,
} from "@/lib/mobile/http";
export const runtime = "nodejs";
export const OPTIONS = options;
export async function POST(request: NextRequest) {
  try {
    const a = await mobileActor(request);
    const raw = await request.text();
    if (raw.length > 900000)
      return NextResponse.json(
        { error: "Comanda este prea mare.", kind: "validation" },
        { status: 413, headers: headers(request) },
      );
    const command = JSON.parse(raw);
    const result = await service.command(a.uid, command);
    const delivery = await dispatchEffect(request, a.uid, command.mutationId);
    return NextResponse.json(
      { ...result, ...(delivery ? { delivery } : {}) },
      { headers: headers(request) },
    );
  } catch (e) {
    return failure(request, e);
  }
}
