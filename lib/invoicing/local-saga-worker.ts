import { importPolicy, requireLiveImports } from "@/lib/saga/import";
import { sagaConfig } from "@/lib/saga/config.server";
import type { SagaTransfer } from "./saga-transfer";

/** Local worker processes one explicitly selected, already queued invoice only. */
export function localWorkerOptions(args: string[], env: Record<string, string | undefined>) {
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (!["--work-id", "--confirm-fiscal", "--confirm-number", "--run", "--allow-live"].includes(key) || flags.has(key))
      throw new Error("Argument invalid sau repetat.");
    if (["--run", "--allow-live"].includes(key)) flags.set(key, "true");
    else {
      const value = args[++i];
      if (!value || value.startsWith("--")) throw new Error("Lipsește valoarea argumentului.");
      flags.set(key, value);
    }
  }
  const workId = flags.get("--work-id") || "";
  if (!workId || workId.length > 200 || /[\/\x00-\x1f]/.test(workId))
    throw new Error("Specifică --work-id pentru un singur tichet.");
  const config = sagaConfig(env), policy = importPolicy(env);
  const run = flags.has("--run"), live = policy.mode !== "dry-run";
  if (run && live) {
    requireLiveImports(policy, config.fiscalCode, config.readsEnabled);
    if (!flags.has("--allow-live") || flags.get("--confirm-fiscal") !== config.fiscalCode || !flags.get("--confirm-number"))
      throw new Error("Transmiterea reală cere --allow-live, --confirm-fiscal și --confirm-number.");
  }
  return { workId, run, live, config, policy, number: flags.get("--confirm-number") };
}

export function assertLocalWorkerTarget(
  job: SagaTransfer,
  target: ReturnType<typeof localWorkerOptions>,
) {
  if (job.workId !== target.workId || job.fiscalCode !== target.config.fiscalCode || job.mode !== target.policy.mode)
    throw new Error("Operațiunea nu corespunde tichetului, firmei sau modului confirmat.");
  if (target.live && target.run && job.number !== target.number)
    throw new Error("Numărul facturii nu corespunde confirmării. Nu s-a procesat nimic.");
}
