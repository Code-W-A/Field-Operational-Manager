import { NextRequest, NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { headers, failure } from "./http";
import { workDocument } from "./documents";
import { canGenerateHrRequestDocx } from "@/lib/hr/request-document-format";
import { generateHrRequestPdfBuffer } from "@/lib/hr/request-pdf.server";
import { generateHrRequestDocxBuffer } from "@/lib/hr/request-docx.server";
import { TechnicianError as MobileError } from "./service";
export function documentHandlers(resolveActor: (request: NextRequest) => Promise<import("@/packages/fom-domain").Actor>) {
async function GET(request: NextRequest) {
  try {
    const a = await resolveActor(request),
      q = request.nextUrl.searchParams;
    if (q.get("requestId")) {
      const rid = q.get("requestId")!;
      if (!/^[\w-]{1,250}$/.test(rid))
        throw new MobileError("Identificator invalid.");
      const snap = await adminDb.collection("hrRequests").doc(rid).get();
      if (snap.data()?.requesterUid !== a.uid)
        throw new MobileError("Cerere inaccesibilă.", 403);
      const data = { ...snap.data(), id: snap.id } as any;
      if (!canGenerateHrRequestDocx(data.kind)) {
        const { buffer, filename } = await generateHrRequestPdfBuffer(data);
        return new NextResponse(new Uint8Array(buffer), {
          headers: {
            ...headers(request),
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`,
          },
        });
      }
      const { buffer, filename } = await generateHrRequestDocxBuffer(data);
      return new NextResponse(new Uint8Array(buffer), {
        headers: {
          ...headers(request),
          "Content-Type":
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          "Content-Disposition": `attachment; filename="${filename.replace(/["\r\n]/g, "")}"`,
        },
      });
    }
    const bytes = await workDocument(
      adminDb,
      a,
      q.get("workId") || "",
      q.get("sheetId") || undefined,
      q.get("revision") || undefined,
      q.get("historyCode") || undefined,
    );
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        ...headers(request),
        "Content-Type": "application/pdf",
        "Content-Disposition": "attachment; filename=Raport_FOM.pdf",
      },
    });
  } catch (e) {
    return failure(request, e);
  }
}

return {GET};
}
