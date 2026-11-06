import { randomUUID } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { sagaConfig, type SagaConfig } from "./config.server";
import { decryptToken, encryptToken } from "./crypto.server";
import { parseReadInput, SagaError, type SagaStatus } from "./contracts";
import { parseSagaResponse } from "./response.server";

type Actor = { uid: string; role: string };
export type SagaConnection = {
  schemaVersion: 1;
  tokenEnc: string;
  state:
    | "ready"
    | "connected"
    | "processing"
    | "needs_review"
    | "authorization_error";
  owner: string | null;
  leaseUntil: number;
  revision: number;
  lastReadAt: string | null;
  lastError: string | null;
  updatedAt: string;
  updatedBy: string;
};
type Dependencies = {
  config?: () => SagaConfig;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
};
export function createSagaService(
  db: Firestore,
  dependencies: Dependencies = {},
) {
  const getConfig = dependencies.config || sagaConfig,
    send = dependencies.fetch || fetch,
    now = dependencies.now || Date.now;
  const ref = (config: SagaConfig) =>
    db.collection("sagaConnections").doc(config.fiscalCode);
  async function authorize(actor: Actor) {
    if (!actor?.uid || actor.role !== "admin")
      throw new SagaError(
        "FORBIDDEN",
        "Doar administratorul poate consulta integrarea SAGA.",
        403,
      );
    const user = (await db.doc(`users/${actor.uid}`).get()).data();
    if (user?.role !== "admin" || user.disabled === true)
      throw new SagaError("FORBIDDEN", "Nu ai acces la integrarea SAGA.", 403);
  }
  async function status(actor: Actor): Promise<SagaStatus> {
    await authorize(actor);
    let config: SagaConfig;
    try {
      config = getConfig();
    } catch (e) {
      if (!(e instanceof SagaError)) throw e;
      return {
        configured: false,
        missing: [e.message],
        fiscalCode: null,
        state: "unconfigured",
        lastReadAt: null,
        lastError: e.code,
      };
    }
    if (!config.readsEnabled)
      return {
        configured: true,
        missing: [],
        fiscalCode: config.fiscalCode,
        state: "disabled",
        lastReadAt: null,
        lastError: null,
      };
    const connection = (await ref(config).get()).data() as
      SagaConnection | undefined;
    let state: SagaStatus["state"] = !connection
      ? "ready"
      : connection.state === "processing"
        ? connection.leaseUntil > now()
          ? "busy"
          : "needs_review"
        : connection.state;
    if (connection) {
      try {
        decryptToken(
          connection.tokenEnc,
          config.encryptionKey,
          config.fiscalCode,
        );
      } catch {
        state = "needs_review";
      }
    }
    if (
      ![
        "ready",
        "connected",
        "busy",
        "needs_review",
        "authorization_error",
      ].includes(state)
    )
      state = "needs_review";
    return {
      configured: true,
      missing: [],
      fiscalCode: config.fiscalCode,
      state,
      lastReadAt: connection?.lastReadAt || null,
      lastError: connection?.lastError || null,
    };
  }
  async function read(actor: Actor, body: unknown) {
    await authorize(actor);
    if (!getConfig().readsEnabled)
      throw new SagaError(
        "READS_DISABLED",
        "Citirile SAGA sunt dezactivate. Activează integrarea după publicarea regulilor de protecție a conexiunii.",
        409,
      );
    const input = parseReadInput(body),
      config = getConfig(),
      connectionRef = ref(config),
      owner = randomUUID();
    const acquired = await db.runTransaction(async (tx) => {
      const snapshot = await tx.get(connectionRef),
        previous = snapshot.exists ? (snapshot.data() as SagaConnection) : null;
      if (previous?.state === "processing") {
        if (previous.leaseUntil > now()) return { error: "BUSY" as const };
        tx.update(connectionRef, {
          state: "needs_review",
          lastError: "INTERRUPTED",
          updatedAt: new Date(now()).toISOString(),
        });
        return { error: "NEEDS_REVIEW" as const };
      }
      if (previous && !["ready", "connected"].includes(previous.state))
        return { error: "NEEDS_REVIEW" as const };
      const token = previous
        ? decryptToken(
            previous.tokenEnc,
            config.encryptionKey,
            config.fiscalCode,
          )
        : config.apiKey;
      const connection: SagaConnection = {
        schemaVersion: 1,
        tokenEnc:
          previous?.tokenEnc ||
          encryptToken(token, config.encryptionKey, config.fiscalCode),
        state: "processing",
        owner,
        leaseUntil: now() + 90000,
        revision: (previous?.revision || 0) + 1,
        lastReadAt: previous?.lastReadAt || null,
        lastError: null,
        updatedAt: new Date(now()).toISOString(),
        updatedBy: actor.uid,
      };
      tx.set(connectionRef, connection);
      return { token };
    });
    if (acquired.error)
      throw new SagaError(
        acquired.error,
        acquired.error === "BUSY"
          ? "Există deja o consultare SAGA în curs. Reîncearcă după finalizarea ei."
          : "Conexiunea SAGA necesită verificare. Nu se reia automat cu o cheie posibil veche.",
        409,
      );
    const token = acquired.token!;
    async function updateOwned(patch: Partial<SagaConnection>) {
      await db.runTransaction(async (tx) => {
        const current = (await tx.get(connectionRef)).data() as
          SagaConnection | undefined;
        if (current?.owner !== owner || current.state !== "processing")
          throw new SagaError(
            "LEASE_LOST",
            "Conexiunea SAGA necesită verificare înainte de alt apel.",
            409,
          );
        tx.update(connectionRef, {
          ...patch,
          updatedAt: new Date(now()).toISOString(),
          revision: current.revision + 1,
        });
      });
    }
    const controller = new AbortController(),
      timer = setTimeout(
        () => controller.abort(),
        dependencies.timeoutMs || 20000,
      );
    let rotation = "",
      persistenceFailed = false;
    try {
      const url = new URL(
        `${config.baseUrl}/Situatii/${input.kind === "article" ? "GetArticol" : "GetStocArticol"}`,
      );
      url.searchParams.set("codArticol", input.code);
      if (input.warehouse) url.searchParams.set("gestiune", input.warehouse);
      if (input.date)
        url.searchParams.set("data", input.date.split("-").reverse().join("."));
      const response = await send(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "X-Saga-Cod-Fiscal": config.fiscalCode,
          Accept:
            input.kind === "article" ? "application/xml" : "application/json",
        },
        redirect: "manual",
        cache: "no-store",
        signal: controller.signal,
      });
      rotation = response.headers.get("X-Saga-Refresh-Token")?.trim() || "";
      if (rotation) {
        if (rotation.length > 16000 || /\s/.test(rotation)) {
          persistenceFailed = true;
          throw new SagaError(
            "INVALID_ROTATION",
            "Cheia reînnoită de SAGA necesită verificare.",
            502,
          );
        }
        try {
          await updateOwned({
            tokenEnc: encryptToken(
              rotation,
              config.encryptionKey,
              config.fiscalCode,
            ),
          });
        } catch {
          persistenceFailed = true;
          throw new SagaError(
            "TOKEN_SAVE_FAILED",
            "Cheia reînnoită nu a putut fi salvată sigur. Conexiunea este oprită pentru verificare.",
            503,
          );
        }
      }
      if (!response.ok) {
        await response.body?.cancel();
        if ([401, 403].includes(response.status))
          throw new SagaError(
            "SAGA_AUTH",
            "SAGA a respins autentificarea. Administratorul trebuie să verifice cheia și firma configurată.",
            502,
          );
        throw new SagaError(
          "SAGA_HTTP",
          `Consultarea SAGA a eșuat (HTTP ${response.status}).`,
          502,
        );
      }
      const reader = response.body?.getReader();
      if (!reader)
        throw new SagaError(
          "INVALID_RESPONSE",
          "SAGA a returnat un răspuns gol.",
          502,
        );
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        for (;;) {
          const item = await reader.read();
          if (item.done) break;
          size += item.value.byteLength;
          if (size > 262144)
            throw new SagaError(
              "INVALID_RESPONSE",
              "Răspunsul SAGA depășește dimensiunea acceptată.",
              502,
            );
          chunks.push(item.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const result = parseSagaResponse(
        input,
        Buffer.concat(chunks).toString("utf8"),
        new Date(now()).toISOString(),
        [config.apiKey, token, rotation],
      );
      await updateOwned({
        state: "connected",
        owner: null,
        leaseUntil: 0,
        lastError: null,
        lastReadAt: result.checkedAt,
      });
      return result;
    } catch (error) {
      const known = error instanceof SagaError;
      const uncertain =
        persistenceFailed || !known || (known && error.code === "LEASE_LOST");
      const code = known
        ? error.code
        : controller.signal.aborted
          ? "TIMEOUT"
          : "NETWORK_ERROR";
      try {
        await updateOwned({
          state: uncertain
            ? "needs_review"
            : code === "SAGA_AUTH"
              ? "authorization_error"
              : "ready",
          owner: null,
          leaseUntil: 0,
          lastError: code,
        });
      } catch {
        /* Processing state/expired lease remains fail-closed if persistence is unavailable. */
      }
      if (known) throw error;
      throw new SagaError(
        code,
        "Consultarea SAGA a fost întreruptă. Conexiunea necesită verificare înainte de alt apel.",
        503,
      );
    } finally {
      clearTimeout(timer);
    }
  }
  return { status, read };
}
