/** Opt-in destructive test ONLY in an explicitly configured SAGA test company.
 * Uses an existing numbered/frozen FOM test invoice: never creates another invoice/number.
 * Does not load .env/.env.local automatically and never falls back to production credentials. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { importPolicy, requireLiveImports } from "../lib/saga/import";
import { sagaConfig } from "../lib/saga/config.server";
import { stockGroups } from "../lib/invoicing/saga-transfer";
import type { PreparedInvoice } from "../lib/invoicing/xml";
export function assertLiveTestConsent(env: Record<string, string | undefined>) {
  for (const key of [
    "SAGA_TEST_ALLOW_IMPORT",
    "SAGA_TEST_NO_CONCURRENT_MOVEMENTS",
    "SAGA_TEST_FIRM_CONFIRMED",
    "SAGA_TEST_FIREBASE_CONFIRMED",
  ])
    assert.equal(
      env[key],
      "true",
      `Refuz execuția: ${key}=true este obligatoriu.`,
    );
  assert.equal(
    env.SAGA_IMPORT_MODE,
    "test",
    "Scriptul acceptă exclusiv modul test.",
  );
  assert.ok(
    env.SAGA_TEST_WORK_ID && env.SAGA_TEST_OPERATOR_UID,
    "Configurează tichetul și operatorul de test.",
  );
  assert.ok(
    env.SAGA_TEST_FIREBASE_PROJECT_ID &&
      env.SAGA_TEST_FIREBASE_PROJECT_ID === env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    "Proiectul Firebase de test trebuie confirmat explicit.",
  );
  assert.ok(
    !env.FIRESTORE_EMULATOR_HOST && !env.FIREBASE_AUTH_EMULATOR_HOST,
    "Testul practic nu este un test cu emulatoare.",
  );
  const config = sagaConfig(env),
    policy = importPolicy(env);
  requireLiveImports(policy, config.fiscalCode, config.readsEnabled);
  return { config, policy };
}
async function main() {
  const { config, policy } = assertLiveTestConsent(process.env);
  // Initialization is deliberately AFTER all consent/config guards.
  const { adminDb } = await import("../lib/firebase/admin");
  const { createInvoiceSagaService } = await import(
    "../lib/invoicing/saga-transfer.server"
  );
  const { createSagaService } = await import("../lib/saga/service.server");
  const workId = process.env.SAGA_TEST_WORK_ID!,
    uid = process.env.SAGA_TEST_OPERATOR_UID!;
  assert.ok(
    !workId.includes("/") && !uid.includes("/"),
    "Identificatori invalizi.",
  );
  const user = (await adminDb.doc(`users/${uid}`).get()).data();
  assert.equal(user?.role, "admin");
  assert.notEqual(user?.disabled, true);
  const invoice = (
    await adminDb.doc(`invoices/${workId}`).get()
  ).data() as PreparedInvoice;
  assert.ok(invoice, "Pregătește în FOM factura de test înainte de execuție.");
  assert.equal(invoice.fiscalCode, config.fiscalCode);
  const groups = stockGroups(invoice);
  assert.equal(
    groups.length,
    1,
    "Testul necesită exact un articol/gestiune de marfă.",
  );
  assert.equal(invoice.snapshot.lines.length, 1);
  assert.equal(groups[0].expected, "2");
  const actor = { uid, role: "admin" },
    gateway = createSagaService(adminDb, {
      config: () => config,
      importPolicy: () => policy,
    }),
    service = createInvoiceSagaService(adminDb, {
      config: () => config,
      policy: () => policy,
      gateway,
    });
  const state = await service.state(actor, workId);
  assert.equal(
    state.transfer,
    null,
    "Factura are deja o operațiune. Nu se retrimite în cadrul testului.",
  );
  const before = await gateway.readForInvoice(actor, {
    kind: "stock",
    code: groups[0].code,
    warehouse: groups[0].warehouse,
  });
  assert.equal(
    Number(before.quantity),
    10,
    "Stocul inițial trebuie să fie exact 10.",
  );
  const started = await service.start(actor, workId, {
    sha256: invoice.sha256,
    operationId: randomUUID(),
  });
  for (let step = 0; step < 30; step++) {
    const v = (await service.state(actor, workId)).transfer!;
    if (!["baseline", "ready", "sending", "after"].includes(v.phase)) {
      // Only bounded operational metadata is printed, never credentials or upstream report bodies.
      console.log(
        JSON.stringify({
          fiscalCode: v.fiscalCode,
          number: v.number,
          importStatus: v.importStatus,
          stockStatus: v.stockStatus,
          before: v.groups[0]?.before,
          after: v.groups[0]?.after,
          delta: v.groups[0]?.delta,
        }),
      );
      assert.equal(
        v.importStatus,
        "imported",
        "Importul nu este confirmat integral. Consultă raportul protejat.",
      );
      assert.equal(
        v.stockStatus,
        "observed",
        "Scăderea efectivă a stocului nu a fost confirmată.",
      );
      assert.equal(Number(v.groups[0].before?.quantity), 10);
      assert.equal(Number(v.groups[0].after?.quantity), 8);
      assert.equal(v.groups[0].delta, "2");
      console.log(
        "PASS test SAGA: 10 → factură pentru 2 → 8, fără intervenție manuală declarată. Observația nu constituie singură dovadă de validare contabilă.",
      );
      return;
    }
    const wait = Math.min(60000, Math.max(0, v.nextAt - Date.now()));
    if (wait) await new Promise((r) => setTimeout(r, wait));
    await service.process(started.transfer!.id, false);
  }
  throw new Error(
    "Testul nu s-a finalizat. Nu retransmite factura; verifică starea existentă.",
  );
}
if (process.argv[1]?.endsWith("test-saga-live-import.ts"))
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : "Test nereușit.");
    process.exitCode = 1;
  });
