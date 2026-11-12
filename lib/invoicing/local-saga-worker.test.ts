import assert from "node:assert/strict";
import test from "node:test";
import { localWorkerOptions, assertLocalWorkerTarget } from "./local-saga-worker";
import type { SagaTransfer } from "./saga-transfer";
const env = {
  SAGA_API_KEY: "fixture-only", SAGA_COD_FISCAL: "123456",
  SAGA_API_BASE_URL: "https://web.sagasoft.ro/api/v20260225",
  SAGA_TOKEN_ENCRYPTION_KEY: "ab".repeat(32), SAGA_READS_ENABLED: "true",
};
const live = { ...env, SAGA_IMPORT_MODE: "production", SAGA_IMPORTS_ENABLED: "true" };
const args = ["--work-id", "ticket"];
const consent = ["--allow-live", "--confirm-fiscal", "123456", "--confirm-number", "NRG0001"];
const job = { workId: "ticket", fiscalCode: "123456", mode: "production", number: "NRG0001" } as SagaTransfer;
test("preflight never implies execution, including production configuration", () => {
  assert.equal(localWorkerOptions(args, env).run, false);
  assert.equal(localWorkerOptions(args, live).run, false);
});
test("requires a single explicit ticket and rejects unknown/duplicate flags", () => {
  for (const a of [[], ["--work-id", "a/b"], [...args, "--all"], [...args, ...args], ["--work-id", "--run"]])
    assert.throws(() => localWorkerOptions(a, env));
});
test("dry-run remains dry-run and can process only simulations", () => {
  const t = localWorkerOptions([...args, "--run"], env);
  assert.equal(t.policy.mode, "dry-run");
  assert.equal(t.live, false);
  assert.throws(() => assertLocalWorkerTarget(job, t));
});
test("live execution requires invoice number and exact company confirmation", () => {
  for (const c of [[], consent.slice(0, 3), ["--allow-live", "--confirm-fiscal", "999999", "--confirm-number", "NRG0001"]])
    assert.throws(() => localWorkerOptions([...args, "--run", ...c], live));
  assert.equal(localWorkerOptions([...args, "--run", ...consent], live).live, true);
});
test("CLI flags cannot bypass disabled imports, disabled reads or test company restrictions", () => {
  for (const e of [{ ...live, SAGA_IMPORTS_ENABLED: "false" }, { ...live, SAGA_READS_ENABLED: "false" }, { ...live, SAGA_IMPORT_MODE: "test" }])
    assert.throws(() => localWorkerOptions([...args, "--run", ...consent], e));
});
test("stored job must match ticket, company, mode and confirmed number", () => {
  const t = localWorkerOptions([...args, "--run", ...consent], live);
  assert.doesNotThrow(() => assertLocalWorkerTarget(job, t));
  for (const patch of [{ workId: "other" }, { fiscalCode: "654321" }, { mode: "dry-run" }, { number: "NRG0002" }])
    assert.throws(() => assertLocalWorkerTarget({ ...job, ...patch } as SagaTransfer, t));
});
