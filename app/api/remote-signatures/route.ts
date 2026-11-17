import { NextRequest, NextResponse } from "next/server";
import { signingServer } from "@/lib/remote-signatures/server";
import {
  body,
  fail,
  identity,
  responseHeaders,
} from "@/lib/remote-signatures/http";
import { check } from "@/lib/remote-signatures/core";
export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "fra1";
export const OPTIONS = (r: NextRequest) =>
  new NextResponse(null, { status: 204, headers: responseHeaders(r) });
export async function GET(r: NextRequest) {
  try {
    const a = await identity(r);
    const value = await signingServer().latest(
      a.uid,
      Object.fromEntries(r.nextUrl.searchParams),
    );
    return NextResponse.json(value, { headers: responseHeaders(r) });
  } catch (e) {
    return fail(r, e);
  }
}
export async function POST(r: NextRequest) {
  try {
    const a = await identity(r),
      input = await body(r),
      service = signingServer();
    check(
      ["create", "cancel", "resend"].includes(input.action),
      "Acțiune invalidă.",
    );
    const value =
      input.action === "create"
        ? await service.create(a.uid, input)
        : input.action === "cancel"
          ? await service.cancel(a.uid, input.id)
          : await service.resend(a.uid, input.id);
    return NextResponse.json(value || { ok: true }, {
      headers: responseHeaders(r),
    });
  } catch (e) {
    return fail(r, e);
  }
}
