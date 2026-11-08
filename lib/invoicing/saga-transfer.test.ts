import { assertLiveTestConsent } from "../../scripts/test-saga-live-import";
import test from "node:test";
import assert from "node:assert/strict";
import {
  importPolicy,
  requireLiveImports,
  parseImportResult,
  redactSagaReport,
} from "@/lib/saga/import";
import { stockGroups, decimalSum, decimalLess } from "./saga-transfer";
import { snapshotFixture } from "./xml.fixtures";
import { invoiceXml, type PreparedInvoice } from "./xml";
import { digest, verifyInvoiceArtifact } from "./saga-artifact.server";
import { workerAuthorized } from "./saga-worker-auth.server";
import { preparedFixture } from "./saga-transfer.fixtures";
test("default dry-run is fail-closed, test company and settings require explicit confirmation", () => {
  const p = importPolicy({});
  assert.equal(p.mode, "dry-run");
  assert.equal(p.checks, 3);
  assert.equal(p.intervalMs, 5000);
  assert.throws(() => requireLiveImports(p, "123456", true));
  for (const patch of [
    { SAGA_IMPORT_MODE: "live" },
    { SAGA_STOCK_CHECK_ATTEMPTS: "6" },
    { SAGA_STOCK_CHECK_INTERVAL_MS: "0" },
  ])
    assert.throws(() => importPolicy(patch));
  const testPolicy = importPolicy({
    SAGA_IMPORT_MODE: "test",
    SAGA_IMPORTS_ENABLED: "true",
    SAGA_TEST_COD_FISCAL: "123456",
    SAGA_TEST_FIRM_CONFIRMED: "true",
  });
  requireLiveImports(testPolicy, "123456", true);
  assert.throws(() => requireLiveImports(testPolicy, "999999", true));
  assert.throws(() => requireLiveImports(testPolicy, "123456", false));
});
test("import status requires consistent body, partial is separate and no unknown status is success", () => {
  for (const [status, body, outcome] of [
    [200, '{"success":true}', "imported"],
    [200, '{"Success":false}', "failed"],
    [200, "OK", "unknown"],
    [200, '{"success":true,"Success":false}', "unknown"],
    [207, "Raport: factura parțial importată", "partial"],
    [207, '{"success":true}', "unknown"],
    [207, "", "unknown"],
    [422, "Raport: import eșuat", "failed"],
    [400, '{"success":false}', "failed"],
    [400, "<html>bad gateway</html>", "unknown"],
    [500, '{"success":true}', "unknown"],
  ] as const)
    assert.equal(parseImportResult(status, body, "now").outcome, outcome);
  assert.equal(
    parseImportResult(200, '{"success":true}', "now", [], true).outcome,
    "unknown",
  );
});
test("reports redact current, initial and refreshed credentials and bearer headers", () => {
  const text = redactSagaReport(
    "fixture-initial-token fixture-current-token fixture-rotation-token Authorization: Bearer other-secret X-Saga-Refresh-Token: header-secret",
    [
      "fixture-initial-token",
      "fixture-current-token",
      "fixture-rotation-token",
    ],
  );
  for (const value of [
    "fixture-initial-token",
    "fixture-current-token",
    "fixture-rotation-token",
    "other-secret",
    "header-secret",
  ])
    assert.ok(!text.includes(value));
});
test("quantities accumulate and subtract exactly with signed arbitrary decimal stock", () => {
  assert.equal(decimalSum("0.1", "0.2"), "0.3");
  assert.equal(decimalSum("10.0000", "2.0000", true), "8");
  assert.equal(decimalSum("-0.01", "0.09", true), "-0.1");
  assert.equal(decimalLess("1.9999", "2"), true);
  const d = preparedFixture();
  d.snapshot.lines.push({ ...d.snapshot.lines[0], id: "b", quantity: "0.25" });
  assert.equal(stockGroups(d)[0].expected, "1.5");
  d.snapshot.lines[1].kind = "service";
  assert.equal(stockGroups(d)[0].expected, "1.25");
  assert.throws(() => decimalSum("NaN", "0"));
});
test("frozen XML integrity checks do not regenerate bytes and reject mapped content mismatch", () => {
  const d = preparedFixture(),
    xml = invoiceXml(d.snapshot, d.number).xml,
    a = { xml, sha256: d.sha256 };
  assert.equal(verifyInvoiceArtifact(d, a, "123456").xml, xml);
  assert.throws(() =>
    verifyInvoiceArtifact(d, { ...a, xml: xml + " " }, "123456"),
  );
  assert.throws(() => verifyInvoiceArtifact(d, a, "654321"));
  const changed = structuredClone(d);
  changed.snapshot.lines[0].quantity = "3";
  assert.throws(() => verifyInvoiceArtifact(changed, a, "123456"));
  const unsafe = xml.replace("<Facturi>", "<!DOCTYPE foo><Facturi>");
  assert.throws(() =>
    verifyInvoiceArtifact(
      { ...d, sha256: digest(unsafe) },
      { xml: unsafe, sha256: digest(unsafe) },
      "123456",
    ),
  );
});
test("internal worker requires a strong, exact server credential", () => {
  const secret = "a".repeat(43);
  assert.equal(
    workerAuthorized(
      new Request("http://localhost", {
        headers: { Authorization: `Bearer ${"é".repeat(43)}` },
      }),
      secret,
    ),
    false,
  );
  assert.equal(
    workerAuthorized(
      new Request("http://localhost", {
        headers: { Authorization: `Bearer ${secret}` },
      }),
      secret,
    ),
    true,
  );
  assert.equal(
    workerAuthorized(
      new Request("http://localhost", {
        headers: { Cookie: "userRole=admin" },
      }),
      secret,
    ),
    false,
  );
  assert.equal(workerAuthorized(new Request("http://localhost"), ""), false);
});

test("live integration script refuses missing consent before loading Firebase or sending requests", () => {
  assert.throws(() => assertLiveTestConsent({}));
  assert.throws(() =>
    assertLiveTestConsent({
      SAGA_TEST_ALLOW_IMPORT: "true",
      SAGA_TEST_NO_CONCURRENT_MOVEMENTS: "true",
      SAGA_TEST_FIRM_CONFIRMED: "true",
      SAGA_TEST_FIREBASE_CONFIRMED: "true",
      SAGA_IMPORT_MODE: "production",
    }),
  );
});

test("historical generator v1 XML bytes are accepted intact rather than reserialized", () => {
  const d = preparedFixture();
  d.snapshot.generatorVersion = 1;
  const xml = invoiceXml(d.snapshot, d.number).xml.replace("\n", "\r\n");
  d.sha256 = digest(xml);
  assert.equal(
    verifyInvoiceArtifact(d, { xml, sha256: d.sha256 }, "123456").xml,
    xml,
  );
});
