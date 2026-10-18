import test from "node:test";
import assert from "node:assert/strict";
import {
  dispatchInstallationDelivery,
  installationDeliveryId,
  type DeliveryClaim,
  type InstallationDeliveryStore,
  type InstallationEmail,
} from "./delivery";
import {
  installationDeliveryMessage,
  type DeliveryResult,
} from "@/packages/fom-domain";
import type { MailTransportPolicy } from "@/lib/email/mail-transport-policy.server";
function harness(mode: MailTransportPolicy["mode"] = "sink") {
  let result: DeliveryResult = { status: "pending" };
  let sends = 0,
    simulations = 0,
    preparations = 0;
  const store: InstallationDeliveryStore = {
    claim: async () => {
      const claimed = result.status === "pending";
      const value = {
        ...result,
        workId: "terminal",
        rootWorkId: "root",
        claimed,
      };
      if (claimed) result = { status: "processing" };
      return value;
    },
    finish: async (value) => {
      result = value;
    },
  };
  const mail: InstallationEmail = {
    recipients: ["beneficiar@example.invalid"],
    subject: "Proces-verbal de instalare — #000100",
    filename: "Proces_verbal_instalare_terminal.pdf",
    pdf: new TextEncoder().encode("%PDF-1.7\nfixture"),
  };
  const dependencies = {
    policy: {
      mode,
      deploymentEnvironment: "staging",
      sinkAllowedDomains: ["example.invalid"],
    } as MailTransportPolicy,
    prepare: async (_claim: DeliveryClaim) => {
      preparations++;
      return mail;
    },
    send: async (_claim: DeliveryClaim, _mail: InstallationEmail) => {
      sends++;
    },
    simulate: async (_claim: DeliveryClaim, _mail: InstallationEmail) => {
      simulations++;
    },
  };
  return {
    store,
    dependencies,
    mail,
    state: () => ({ result, sends, simulations, preparations }),
  };
}
test("sink records the validated attachment without SMTP", async () => {
  const h = harness();
  assert.deepEqual(
    await dispatchInstallationDelivery(h.store, h.dependencies),
    { status: "simulated" },
  );
  assert.equal(h.state().simulations, 1);
  assert.equal(h.state().sends, 0);
});
test("repeated and concurrent requests cannot send the same PV twice", async () => {
  const h = harness("smtp");
  const results = await Promise.all(
    Array.from({ length: 8 }, () =>
      dispatchInstallationDelivery(h.store, h.dependencies),
    ),
  );
  assert(results.some((result) => result?.status === "sent"));
  assert.equal(h.state().sends, 1);
  assert.equal(
    (await dispatchInstallationDelivery(h.store, h.dependencies))?.status,
    "sent",
  );
  assert.equal(h.state().sends, 1);
});
test("SMTP lost response is uncertain and never replayed", async () => {
  const h = harness("smtp");
  let attempts = 0;
  h.dependencies.send = async () => {
    attempts++;
    throw new Error("Răspuns SMTP pierdut.");
  };
  const delivery = await dispatchInstallationDelivery(h.store, h.dependencies);
  assert.equal(delivery?.status, "uncertain");
  assert.match(
    installationDeliveryMessage(delivery),
    /emailul nu a fost confirmat/,
  );
  await dispatchInstallationDelivery(h.store, h.dependencies);
  assert.equal(attempts, 1);
});
for (const scenario of [
  "missing-recipients",
  "pdf-error",
  "disabled",
  "blocked-sink",
  "invalid-pdf",
] as const) {
  test(`pre-send failure stays durable without SMTP: ${scenario}`, async () => {
    const h = harness(scenario === "disabled" ? "disabled" : "sink");
    if (scenario === "missing-recipients") h.mail.recipients = [];
    if (scenario === "pdf-error")
      h.dependencies.prepare = async () => {
        throw new Error("PDF indisponibil");
      };
    if (scenario === "blocked-sink")
      h.mail.recipients = ["someone@real-client.test"];
    if (scenario === "invalid-pdf") h.mail.pdf = new Uint8Array();
    const delivery = await dispatchInstallationDelivery(
      h.store,
      h.dependencies,
    );
    assert.equal(delivery?.status, "failed");
    assert.equal(h.state().result.status, "failed");
    assert.equal(h.state().sends, 0);
    assert.equal(h.state().simulations, 0);
    const preparations = h.state().preparations;
    await dispatchInstallationDelivery(h.store, h.dependencies);
    assert.equal(h.state().preparations, preparations);
  });
}
test("historical documents are not backfilled", async () => {
  const h = harness();
  h.store.claim = async () => null;
  assert.equal(
    await dispatchInstallationDelivery(h.store, h.dependencies),
    undefined,
  );
  assert.equal(h.state().preparations, 0);
  assert.equal(installationDeliveryMessage(), "");
});
test("failure to persist SMTP result remains uncertain", async () => {
  const h = harness("smtp");
  h.store.finish = async () => {
    throw new Error("Firestore unavailable");
  };
  assert.equal(
    (await dispatchInstallationDelivery(h.store, h.dependencies))?.status,
    "uncertain",
  );
  assert.equal(h.state().sends, 1);
  await dispatchInstallationDelivery(h.store, h.dependencies);
  assert.equal(h.state().sends, 1);
});
test("immutable identity and clear delivery messages", () => {
  assert.equal(installationDeliveryId("root"), "installation-completion_root");
  assert.match(
    installationDeliveryMessage({ status: "sent" }),
    /finalizat și trimis/,
  );
  assert.match(
    installationDeliveryMessage({ status: "simulated" }),
    /simulată/,
  );
  assert.match(
    installationDeliveryMessage({ status: "processing" }),
    /în curs/,
  );
});

test("stale processing is visibly uncertain without permitting a resend", async () => {
  const { installationDeliveryResult } = await import("./delivery");
  const expired = installationDeliveryResult({
    status: "processing",
    updatedAt: { toMillis: () => Date.now() - 6 * 60_000 },
  });
  assert.equal(expired.status, "uncertain");
  assert.match(expired.error!, /Verifică jurnalul/);
  assert.equal(
    installationDeliveryResult({
      status: "processing",
      updatedAt: { toMillis: () => Date.now() },
    }).status,
    "processing",
  );
});
test("PV email uses the frozen ticket number and signed document wording", async () => {
  const { installationCompletionEmail } = await import("./email-content");
  const content = installationCompletionEmail("#000123");
  assert.equal(content.subject, "Proces-verbal de instalare — #000123");
  assert.match(content.message, /procesul-verbal final de instalare/);
  assert.match(content.message, /semnat de tehnician și beneficiar/);
});
