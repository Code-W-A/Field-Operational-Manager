import { InvoiceXmlError } from "./xml";
import { InvoiceNumberingError } from "./numbering";
import { InvoiceDraftError } from "./draft";
import { SagaError } from "@/lib/saga/contracts";
import type { createInvoiceXmlService } from "./xml.server";
export function invoiceXmlHandlers(
  service: ReturnType<typeof createInvoiceXmlService>,
  authenticate: (r: Request) => Promise<{ uid: string; role: string }>,
) {
  async function respond(run: () => Promise<unknown>, download = false) {
    try {
      const value = await run();
      if (download) {
        const file = value as { xml: string; filename: string };
        return new Response(file.xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Content-Disposition": `attachment; filename="invoice.xml"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
            "Cache-Control": "private, no-store",
            "X-Content-Type-Options": "nosniff",
          },
        });
      }
      return Response.json(value, {
        headers: { "Cache-Control": "private, no-store" },
      });
    } catch (e) {
      const known =
        e instanceof InvoiceXmlError ||
        e instanceof InvoiceNumberingError ||
        e instanceof InvoiceDraftError ||
        e instanceof SagaError;
      const error = e as Error & { status?: number; code?: string };
      const status = known
        ? error.status!
        : [401, 403].includes(error.status || 0)
          ? error.status!
          : 503;
      return Response.json(
        {
          code: known ? error.code : "UNAVAILABLE",
          error: known
            ? error.message
            : status === 401
              ? "Autentificare necesară."
              : status === 403
                ? "Nu ai acces."
                : "Pregătirea XML nu este disponibilă momentan.",
        },
        { status, headers: { "Cache-Control": "private, no-store" } },
      );
    }
  }
  async function body(r: Request) {
    const raw = await r.text();
    if (raw.length > 20000)
      throw new InvoiceXmlError("INVALID_INPUT", "Cererea este prea mare.");
    try {
      return JSON.parse(raw);
    } catch {
      throw new InvoiceXmlError("INVALID_INPUT", "Cerere invalidă.");
    }
  }
  return {
    profile: (r: Request) =>
      respond(async () => service.profile(await authenticate(r))),
    saveProfile: (r: Request) =>
      respond(async () =>
        service.saveProfile(await authenticate(r), await body(r)),
      ),
    document: (r: Request, id: string) =>
      respond(async () => service.document(await authenticate(r), id)),
    preview: (r: Request, id: string) =>
      respond(async () =>
        service.preview(await authenticate(r), id, await body(r)),
      ),
    prepare: (r: Request, id: string) =>
      respond(async () =>
        service.prepare(await authenticate(r), id, await body(r)),
      ),
    download: (r: Request, id: string) =>
      respond(async () => service.download(await authenticate(r), id), true),
  };
}
