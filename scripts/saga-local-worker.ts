/** Explicit, single-invoice local worker. Default is read-only preflight.
 * Uses the same persistent processor as Firebase; never creates/requeues invoices.
 */
import { createRequire } from "node:module";
const nextEnv = createRequire(import.meta.url)("@next/env") as typeof import("@next/env");
import { createHash } from "node:crypto";
import { localWorkerOptions, assertLocalWorkerTarget } from "../lib/invoicing/local-saga-worker";
import { transferPending, type SagaTransfer } from "../lib/invoicing/saga-transfer";

let diagnosticStage = "configuration";
async function main() {
  nextEnv.loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const target = localWorkerOptions(process.argv.slice(2), process.env);
  diagnosticStage = "firebase";
  const { adminDb } = await import("../lib/firebase/admin");
  const transferId = createHash("sha256").update(JSON.stringify([target.config.fiscalCode, target.workId])).digest("hex");
  const ref = adminDb.collection(target.live ? "invoiceSagaTransfers" : "invoiceSagaSimulations").doc(transferId);
  async function read() {
    const job = (await ref.get()).data() as SagaTransfer | undefined;
    if (!job) throw new Error("Nu există operațiune în modul ales. Confirmă mai întâi factura în FOM. Simulările nu sunt convertite în importuri reale.");
    assertLocalWorkerTarget(job, target);
    return job;
  }
  function report(job: SagaTransfer) {
    console.log(JSON.stringify({ workId: job.workId, fiscalCode: job.fiscalCode, number: job.number, mode: job.mode, phase: job.phase, importStatus: job.importStatus, stockStatus: job.stockStatus,
      stock: job.groups.map(g => ({ code: g.code, warehouse: g.warehouse, expected: g.expected, before: g.before, after: g.after, delta: g.delta })) }));
  }
  diagnosticStage = "queued-operation";
  let job = await read();
  report(job);
  if (!target.run) {
    console.log("Verificare fără procesare: niciun apel SAGA, nicio scriere.");
    return;
  }
  diagnosticStage = "processor";
  const { createInvoiceSagaService } = await import("../lib/invoicing/saga-transfer.server");
  const deny = async (): Promise<never> => { throw new Error("Transport SAGA interzis în simulare."); };
  const service = createInvoiceSagaService(adminDb, {
    config: () => target.config, policy: () => target.policy,
    ...(target.live ? {} : { gateway: { readForInvoice: deny, importForInvoice: deny } }),
  });
  let stopped = false;
  process.once("SIGINT", () => { stopped = true; });
  process.once("SIGTERM", () => { stopped = true; });
  // A restart resumes persisted steps; the processor never retries an uncertain POST.
  while (!stopped && transferPending(job)) {
    const wait = Math.min(5000, Math.max(0, Math.max(job.nextAt, job.leaseUntil) - Date.now()));
    if (wait) await new Promise(r => setTimeout(r, wait));
    if (stopped) break;
    await service.process(transferId, !target.live);
    job = await read();
    report(job);
    if (transferPending(job)) await new Promise(r => setTimeout(r, 1000));
  }
  if (stopped) console.log("Procesor oprit; operațiunea persistentă rămâne disponibilă pentru reluare.");
  else if (job.importStatus !== "imported" || !["observed", "not_applicable"].includes(job.stockStatus)) process.exitCode = 2;
}
main().catch((error: unknown) => {
  // SDK/upstream errors can contain credentials: never print arbitrary error bodies.
  console.error("Procesarea nu a fost finalizată. Verifică argumentele, configurația și starea/raportul protejat din FOM. Nu retrimite factura.");
  console.error("Etapă:", diagnosticStage);
  console.error("Cod diagnostic:", error && typeof error === "object" && "code" in error ? String(error.code).replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60) : "LOCAL_WORKER_INPUT");
  process.exitCode = 1;
});
