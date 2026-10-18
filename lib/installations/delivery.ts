import type { DeliveryResult } from "@/packages/fom-domain";
import type { MailTransportPolicy } from "@/lib/email/mail-transport-policy.server";
import { areSinkRecipientsAllowed } from "@/lib/email/mail-transport-policy.server";

export type InstallationEmail = {
  recipients: string[];
  subject: string;
  filename: string;
  pdf: Uint8Array;
};
export type DeliveryClaim = DeliveryResult & {
  claimed: boolean;
  workId: string;
  rootWorkId: string;
};
export type InstallationDeliveryStore = {
  claim(): Promise<DeliveryClaim | null>;
  finish(result: DeliveryResult): Promise<void>;
};
export const installationDeliveryId = (rootWorkId: string) =>
  `installation-completion_${rootWorkId}`;

export function installationDeliveryResult(
  value: Record<string, any>,
): DeliveryResult {
  if (
    value.status === "processing" &&
    Date.now() - (value.updatedAt?.toMillis?.() || 0) > 5 * 60_000
  )
    return {
      status: "uncertain",
      error:
        "O trimitere anterioară nu a confirmat rezultatul. Verifică jurnalul emailurilor înainte de retrimitere.",
    };
  return {
    status: value.status,
    ...(value.error ? { error: value.error } : {}),
  };
}

/** Claim once. Never automatically replay an ambiguous or failed SMTP attempt. */
export async function dispatchInstallationDelivery(
  store: InstallationDeliveryStore,
  dependencies: {
    policy: MailTransportPolicy;
    prepare(claim: DeliveryClaim): Promise<InstallationEmail>;
    send(claim: DeliveryClaim, mail: InstallationEmail): Promise<void>;
    simulate(claim: DeliveryClaim, mail: InstallationEmail): Promise<void>;
  },
): Promise<DeliveryResult | undefined> {
  let claim: DeliveryClaim | null;
  try {
    claim = await store.claim();
  } catch (error) {
    console.error("Installation completion email claim failed", error);
    return {
      status: "uncertain",
      error: "Starea trimiterii nu a putut fi verificată.",
    };
  }
  if (!claim) return undefined;
  if (!claim.claimed)
    return {
      status: claim.status,
      ...(claim.error ? { error: claim.error } : {}),
    };
  let smtpStarted = false;
  let delivery: DeliveryResult;
  try {
    if (dependencies.policy.mode === "disabled")
      throw new Error("Serviciul de email nu este configurat.");
    const mail = await dependencies.prepare(claim);
    if (!mail.recipients.length)
      throw new Error(
        "Nu există destinatari configurați pentru raportul tichetului.",
      );
    if (
      !mail.pdf.length ||
      new TextDecoder().decode(mail.pdf.slice(0, 5)) !== "%PDF-"
    )
      throw new Error("Procesul-verbal PDF nu a putut fi generat.");
    if (dependencies.policy.mode === "sink") {
      if (
        !areSinkRecipientsAllowed(
          mail.recipients,
          dependencies.policy.sinkAllowedDomains,
        )
      )
        throw new Error("Destinatarii nu sunt permiși de transportul izolat.");
      await dependencies.simulate(claim, mail);
      delivery = { status: "simulated" };
    } else {
      smtpStarted = true;
      await dependencies.send(claim, mail);
      delivery = { status: "sent" };
    }
  } catch (error) {
    delivery = {
      status: smtpStarted ? "uncertain" : "failed",
      error:
        error instanceof Error
          ? error.message
          : "Trimiterea emailului a eșuat.",
    };
  }
  try {
    await store.finish(delivery);
  } catch {
    return {
      status: "uncertain",
      error:
        "Rezultatul trimiterii nu a putut fi salvat. Nu relua automat trimiterea.",
    };
  }
  return delivery;
}
