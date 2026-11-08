import * as functions from "firebase-functions";
import { getFirestore } from "firebase-admin/firestore";
const region = "europe-west1";
function configuration() {
  if (process.env.SAGA_WORKER_ENABLED !== "true") return null;
  const secret = process.env.SAGA_WORKER_SECRET || "",
    raw = process.env.SAGA_WORKER_APP_URL || "",
    fiscalCode = (process.env.SAGA_WORKER_COD_FISCAL || "")
      .trim()
      .replace(/^RO/i, ""),
    mode = process.env.SAGA_IMPORT_MODE || "dry-run";
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (
    !/^\d{2,10}$/.test(fiscalCode) ||
    !["dry-run", "test", "production"].includes(mode) ||
    !/^[A-Za-z0-9_-]{43,128}$/.test(secret) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    (url.protocol !== "https:" &&
      !(
        process.env.FUNCTIONS_EMULATOR === "true" &&
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      ))
  )
    return null;
  return {
    fiscalCode,
    mode,
    url: new URL("/api/internal/saga-worker", url).href,
    secret,
  };
}
async function dispatch(transferId: string, simulation: boolean) {
  const cfg = configuration();
  if (!cfg || !/^[a-f0-9]{64}$/.test(transferId)) return;
  const deadline = Date.now() + 200000;
  for (let step = 0; step < 120 && Date.now() < deadline; step++) {
    const abort = new AbortController(),
      timer = setTimeout(() => abort.abort(), 55000);
    let response: Response;
    try {
      response = await fetch(cfg.url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cfg.secret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ transferId, simulation }),
        redirect: "manual",
        signal: abort.signal,
      });
    } catch {
      return;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      await response.body?.cancel();
      return;
    }
    let result: { processed?: boolean; pending?: boolean; nextAt?: number };
    try {
      result = await response.json();
    } catch {
      return;
    }
    if (!result.pending) return;
    const delay = Math.min(
      60000,
      Math.max(result.processed ? 50 : 2000, (result.nextAt || 0) - Date.now()),
    );
    if (Date.now() + delay >= deadline) return;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}
const opts = { timeoutSeconds: 300, secrets: ["SAGA_WORKER_SECRET"] };
function queued(
  change: functions.Change<functions.firestore.DocumentSnapshot>,
  transferId: string,
  simulation: boolean,
) {
  if (!change.after.exists) return;
  const value = change.after.data()!,
    before = change.before.data(),
    active = (phase: string) =>
      ["baseline", "ready", "sending", "after"].includes(phase);
  if (!active(value.phase) || (before && active(before.phase))) return;
  const cfg = configuration();
  if (cfg && value.fiscalCode === cfg.fiscalCode && value.mode === cfg.mode)
    return dispatch(transferId, simulation);
  return;
}
export const onInvoiceSagaTransferQueued = functions
  .region(region)
  .runWith(opts)
  .firestore.document("invoiceSagaTransfers/{transferId}")
  .onWrite((change, c) => queued(change, c.params.transferId, false));
export const onInvoiceSagaSimulationQueued = functions
  .region(region)
  .runWith(opts)
  .firestore.document("invoiceSagaSimulations/{transferId}")
  .onWrite((change, c) => queued(change, c.params.transferId, true));
export const processPendingSagaTransfers = functions
  .region(region)
  .runWith(opts)
  .pubsub.schedule("every 1 minutes")
  .onRun(async () => {
    const cfg = configuration();
    if (!cfg) return;
    const simulation = cfg.mode === "dry-run",
      collection = simulation
        ? "invoiceSagaSimulations"
        : "invoiceSagaTransfers";
    const docs = await getFirestore()
      .collection(collection)
      .where("fiscalCode", "==", cfg.fiscalCode)
      .where("mode", "==", cfg.mode)
      .where("phase", "in", ["baseline", "ready", "sending", "after"])
      .orderBy("nextAt")
      .limit(5)
      .get();
    await Promise.all(docs.docs.map((doc) => dispatch(doc.id, simulation)));
  });
