import { readFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "firebase-admin/storage";
import { adminDb } from "@/lib/firebase/admin";
import { servicePdf, revisionPdf } from "@/lib/technician/documents";
import { renderInstallationPdf } from "@/lib/pdf/installation-render";
import { resolveMailTransport } from "@/lib/email/resolve-mail-transport.server";
import { sendMailWithSentCopy } from "@/lib/email/send-with-sent-copy.server";
import {
  areSinkRecipientsAllowed,
  resolveMailTransportPolicy,
} from "@/lib/email/mail-transport-policy.server";
import { loadCurrentTicketRecipients } from "@/lib/work-documents/current-ticket-recipients.server";
import { check, signingSecret, type Data } from "./core";
import { remoteSigning, type MailStage } from "./service";

export async function signingPdf(r: Data, revision = false) {
  const d = r.status === "signed" ? r.finalDocument : r.document;
  if (r.target.kind === "report") {
    const work = {
      ...d,
      id: r.target.workId,
      raportSnapshot: d,
      mobileRevisionSnapshot: d.mobileRevisionSnapshot || [],
    };
    return revision ? revisionPdf(adminDb, work) : servicePdf(adminDb, work);
  }
  const document = {
    beneficiaryName: "În așteptarea semnăturii",
    beneficiarySignature: "",
    ...d,
  };
  const doc = await renderInstallationPdf(
    document as any,
    r.target.workId,
    r.target.sheetId,
    async (photo) => {
      // Paths originate exclusively in the official frozen document, never in public input.
      return new Uint8Array(
        (
          await getStorage()
            .bucket(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET)
            .file(photo.path)
            .download()
        )[0],
      );
    },
    {
      logoDataUrl: `data:image/png;base64,${(await readFile(path.join(process.cwd(), "public/nrglogo.png"))).toString("base64")}`,
    },
  );
  return Buffer.from(doc.output("arraybuffer"));
}

export function signingServer() {
  const secret = signingSecret();
  const origin = process.env.REMOTE_SIGNATURE_ORIGIN || "";
  check(
    /^https:\/\/[^/]+$/.test(origin) ||
      (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
        /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)),
    "Adresa publică de semnare nu este configurată.",
    503,
  );
  return remoteSigning(adminDb, {
    secret,
    origin,
    send: async (r, stage, link) => send(r, stage, link),
  });
}
async function send(r: Data, stage: MailStage, link: string) {
  const policy = resolveMailTransportPolicy();
  check(policy.mode !== "disabled", "Serviciul email nu este configurat.", 503);
  const recipients = new Set<string>([r.email]);
  if (stage === "final") {
    const current = await loadCurrentTicketRecipients(
      r.target.workId,
      "report",
    );
    for (const e of [
      ...current.emails,
      ...(current.work.reportManualRecipients || []),
    ])
      recipients.add(e);
  }
  const number =
    r.document.nrLucrare || r.document.workNumber || r.target.workId;
  const subject =
    stage === "invite"
      ? `Solicitare semnătură — tichet ${number}`
      : stage === "confirm"
        ? `Confirmă semnătura — tichet ${number}`
        : `Document semnat — tichet ${number}`;
  const text =
    stage === "invite"
      ? `Vă rugăm să verificați și să semnați documentul pentru tichetul ${number}.\n\n${link}\n\nDupă desenarea semnăturii veți primi un al doilea email pentru confirmarea finală. Linkul expiră în 7 zile.`
      : stage === "confirm"
        ? `Semnătura dumneavoastră este importantă. Verificați documentul și semnătura, apoi apăsați „Confirm semnătura și finalizez”.\n\n${link}\n\nSimpla deschidere a linkului nu finalizează semnarea. Linkul este valabil maximum 24 de ore. Dacă nu ați desenat această semnătură, nu o confirmați și contactați expeditorul.`
        : `Semnarea documentului pentru tichetul ${number} a fost finalizată. Documentul PDF este atașat.\n\n${link}`;
  const attachments =
    stage === "final"
      ? [
          {
            filename: `Document_${number.replace(/[^\w-]/g, "")}.pdf`,
            content: await signingPdf(r),
          },
          ...(r.target.kind === "report" && r.document.tipLucrare === "Revizie"
            ? [
                {
                  filename: "Fisa_revizie.pdf",
                  content: await signingPdf(r, true),
                },
              ]
            : []),
        ]
      : [];
  if (policy.mode === "sink") {
    check(
      areSinkRecipientsAllowed([...recipients], policy.sinkAllowedDomains),
      "Destinatari nepermiși în mediul de test.",
      403,
    );
    // Do not call SMTP in sink mode. Keep a server-only, test-readable envelope.
    await adminDb
      .collection("remoteSignatures")
      .doc(r.id)
      .collection("testMail")
      .doc(`${stage}_${r.challengeNonce || "initial"}`)
      .set({
        subject,
        text,
        recipients: [...recipients],
        attachments: attachments.map((a) => ({
          filename: a.filename,
          bytes: a.content.length,
        })),
        createdAt: new Date().toISOString(),
      });
    return { status: "simulated" as const };
  }
  const mail = await resolveMailTransport(r.requesterUid);
  const info = await sendMailWithSentCopy({
    transporter: mail.transporter,
    smtpAuth: mail.smtpAuth,
    imapExplicit: mail.imapExplicit,
    mailOptions: {
      from: mail.mailFrom,
      to: [...recipients],
      subject,
      text,
      attachments,
    },
    imapContext: { route: "/api/remote-signatures", requestId: r.id },
  });
  const accepted = (info.accepted || []).map((address: any) =>
    String(
      typeof address === "string" ? address : address.address || "",
    ).toLowerCase(),
  );
  check(
    accepted.includes(r.email) && !(info.rejected || []).length,
    "Serverul de email nu a acceptat toți destinatarii.",
    502,
  );
  return { status: "sent" as const, messageId: String(info.messageId || "") };
}
