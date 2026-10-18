import { NextRequest } from "next/server";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { adminDb } from "@/lib/firebase/admin";
import { POST as sendReport } from "@/app/api/send-email/route";
import { renderInstallationPdf } from "@/lib/pdf/installation-render";
import { loadCurrentTicketRecipients } from "@/lib/work-documents/current-ticket-recipients.server";
import { resolveMailTransportPolicy } from "@/lib/email/mail-transport-policy.server";
import { logEmailEventServer } from "@/lib/email/email-events.server";
import { dispatchInstallationDelivery } from "./delivery";
import { installationDeliveryStore } from "./delivery-store";
import { installationCompletionEmail } from "./email-content";

export async function sendInstallationCompletion(
  request: NextRequest,
  workId: string,
  effectId: string | undefined,
) {
  if (!effectId) return undefined; // Never backfill historical signed documents.
  const store = installationDeliveryStore(adminDb, workId, effectId);
  return dispatchInstallationDelivery(store, {
    policy: resolveMailTransportPolicy(),
    prepare: async (claim) => {
      const current = await loadCurrentTicketRecipients(claim.workId, "report");
      const completion = (
        await adminDb
          .collection("lucrari")
          .doc(claim.rootWorkId)
          .collection("installationCompletion")
          .doc("final")
          .get()
      ).data();
      if (
        !completion?.documentSnapshot ||
        completion.terminalWorkId !== claim.workId ||
        completion.deliveryEffectId !== effectId
      )
        throw new Error("Procesul-verbal semnat nu este disponibil.");
      const doc = await renderInstallationPdf(
        completion.documentSnapshot,
        claim.workId,
        undefined,
        async () => {
          throw new Error("Procesul-verbal final nu conține fotografii.");
        },
        {
          logoDataUrl: `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/nrglogo.png"))).toString("base64")}`,
        },
      );
      return {
        recipients: current.emails,
        subject: installationCompletionEmail(
          completion.documentSnapshot.workNumber,
        ).subject,
        filename: `Proces_verbal_instalare_${claim.workId}.pdf`,
        pdf: new Uint8Array(doc.output("arraybuffer")),
      };
    },
    send: async (claim, mail) => {
      const form = new FormData();
      form.set("recipientMode", "current-ticket");
      form.set("documentKind", "installation-completion");
      form.set("lucrareId", claim.workId);
      form.set(
        "pdfFile",
        new File([new Uint8Array(mail.pdf)], mail.filename, {
          type: "application/pdf",
        }),
      );
      const headers = new Headers();
      for (const key of ["authorization", "cookie"]) {
        const value = request.headers.get(key);
        if (value) headers.set(key, value);
      }
      const response = await sendReport(
        new NextRequest(new URL("/api/send-email", request.url), {
          method: "POST",
          headers,
          body: form,
        }),
      );
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(
          result.error || "Trimiterea emailului nu a fost confirmată.",
        );
      }
    },
    simulate: async (claim, mail) => {
      await logEmailEventServer({
        type: "REPORT",
        lucrareId: claim.workId,
        to: mail.recipients,
        subject: mail.subject,
        status: "skipped",
        provider: "sink",
        meta: {
          action: "installation-complete",
          effectId,
          pdfName: mail.filename,
          pdfBytes: mail.pdf.length,
          simulated: true,
        },
      });
    },
  });
}
