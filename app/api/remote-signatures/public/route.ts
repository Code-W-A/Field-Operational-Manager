import { NextRequest, NextResponse } from "next/server";
import { signingServer, signingPdf } from "@/lib/remote-signatures/server";
import { body, fail, responseHeaders } from "@/lib/remote-signatures/http";
import { check } from "@/lib/remote-signatures/core";
export const runtime = "nodejs";
export const maxDuration = 60;
export const preferredRegion = "fra1";
// Tokens travel in POST bodies, not URLs/access logs. Viewing is read-only.
export async function POST(r: NextRequest) {
  try {
    const input = await body(r),
      service = signingServer();
    check(
      typeof input.token === "string" && input.token.length <= 100,
      "Link invalid.",
    );
    let value: unknown;
    if (input.action === "submit")
      value = await service.submit(input.id, input.token, input);
    else if (input.action === "confirm")
      value = await service.confirm(input.id, input.token, input.accepted);
    else if (input.action === "resendConfirmation")
      value = await service.resendConfirmation(input.id, input.token);
    else {
      check(["view", "pdf"].includes(input.action), "Acțiune invalidă.");
      const request = await service.access(input.id, input.token, input.phase);
      if (input.action === "pdf")
        return new NextResponse(
          new Uint8Array(await signingPdf(request, input.revision === true)),
          {
            headers: {
              ...responseHeaders(r),
              "Content-Type": "application/pdf",
              "Content-Disposition": 'inline; filename="Document.pdf"',
            },
          },
        );
      value = service.publicView(request);
    }
    return NextResponse.json(value, { headers: responseHeaders(r) });
  } catch (e) {
    return fail(r, e);
  }
}
