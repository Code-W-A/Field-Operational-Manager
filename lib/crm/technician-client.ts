import { doc, getDoc } from "firebase/firestore";
import type { CrmAction, CrmCommand } from "@/packages/fom-domain/crm";
import { assertCrmResponseContract } from "@/packages/fom-domain/crm";
import {
  readApiJson,
  ApiResponseError,
  assertApiDownload,
} from "@/packages/fom-domain/api-response";
const inFlight = new Map<string, Promise<any>>();

export async function downloadTechnicianCrmFile(
  kind: "file" | "offer" | "certified",
  id: string,
  filename: string,
) {
  const { auth } = await import("@/lib/firebase/config");
  const user = auth.currentUser;
  if (!user) throw new Error("Autentifică-te pentru a descărca documentul.");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(
      `/api/technician/crm/download?kind=${kind}&id=${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${await user.getIdToken()}` },
        signal: controller.signal,
        cache: "no-store",
      },
    );
    await assertApiDownload(response, true);
    const blob = await response.blob();
    if (auth.currentUser?.uid !== user.uid)
      throw new Error("Sesiunea s-a schimbat.");
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  } finally {
    clearTimeout(timer);
  }
}
/** Null preserves the administrator/dispatcher implementation. */
export async function technicianCrmRequest(
  path: string,
  body?: unknown,
): Promise<any | null> {
  if (typeof window === "undefined") return null;
  const { auth, db } = await import("@/lib/firebase/config");
  const user = auth.currentUser;
  if (!user) return null;
  const profile = await getDoc(doc(db, "users", user.uid));
  if (profile.data()?.role !== "tehnician") return null;
  const key = `${user.uid}:${path}`;
  if (body === undefined && inFlight.has(key)) return inFlight.get(key)!;
  const work = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await fetch(`/api/technician/crm/${path}`, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${await user.getIdToken()}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      const data = await readApiJson(response, true);
      assertCrmResponseContract(data);
      if (auth.currentUser?.uid !== user.uid)
        throw new Error("Sesiunea s-a schimbat.");
      return data;
    } finally {
      clearTimeout(timer);
    }
  })();
  if (body === undefined) {
    inFlight.set(key, work);
    void work.finally(() => inFlight.delete(key)).catch(() => {});
  }
  return work;
}
function pendingKey(uid: string) {
  return `fom-crm-pending-v1:${uid}`;
}
function readPending(uid: string): Record<string, CrmCommand> {
  const saved = sessionStorage.getItem(pendingKey(uid));
  if (!saved) return {};
  try {
    return JSON.parse(saved);
  } catch {
    throw new Error("Operațiile CRM precedente nu pot fi restaurate.");
  }
}
export async function technicianCrmCommand(
  action: CrmAction,
  entityId: string | undefined,
  payload: Record<string, any>,
) {
  if (typeof window === "undefined") return null;
  const { auth, db } = await import("@/lib/firebase/config");
  if (!auth.currentUser) return null;
  const user = auth.currentUser,
    profile = await getDoc(doc(db, "users", user.uid));
  if (profile.data()?.role !== "tehnician") return null;
  const key = JSON.stringify([action, entityId, payload]),
    pending = readPending(user.uid);
  for (const [previousKey, previous] of Object.entries(pending)) {
    if (previousKey === key) continue;
    const receipt = await technicianCrmRequest(`receipt?id=${previous.id}`);
    if (!receipt?.result)
      throw new Error(
        "Reîncearcă operația precedentă înainte de o modificare nouă.",
      );
    delete pending[previousKey];
  }
  const c = pending[key] || {
    id: crypto.randomUUID(),
    action,
    entityId,
    payload,
  };
  // Persist before sending: a lost response survives navigation or reload.
  pending[key] = c;
  sessionStorage.setItem(pendingKey(user.uid), JSON.stringify(pending));
  const clear = () => {
    const latest = readPending(user.uid);
    delete latest[key];
    sessionStorage.setItem(pendingKey(user.uid), JSON.stringify(latest));
  };
  try {
    const receipt = await technicianCrmRequest(`receipt?id=${c.id}`);
    const data = receipt?.result
      ? receipt
      : await technicianCrmRequest("commands", c);
    clear();
    return data?.result;
  } catch (e) {
    if (e instanceof ApiResponseError && e.status >= 400 && e.status < 500)
      clear();
    throw e;
  }
}
