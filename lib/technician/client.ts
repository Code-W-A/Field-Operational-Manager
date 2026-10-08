"use client";

import { auth, db } from "@/lib/firebase/config";
import { doc, getDoc } from "firebase/firestore";
import { FOM_CONTRACT_VERSION, assertCommand, versionOf, type CommandAction, type CommandPayloadMap, type Command } from "@/packages/fom-domain";

export class TechnicianCommandError extends Error {
  constructor(message: string, public kind: string) { super(message); }
}
async function authenticatedFetch(path: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new TechnicianCommandError("Autentifică-te din nou.", "blocked");
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${await user.getIdToken()}`);
  return fetch(path, { ...init, headers, credentials: "same-origin", cache: "no-store" });
}
/** Retains the exact envelope after a lost response. Retrying never allocates another receipt. */
export async function technicianCommand<A extends CommandAction>(
  action: A, entityId: string, payload: CommandPayloadMap[A],
  options: { work?: Record<string, any>; occurredAt?: string; mutationId?: string; retryKey?: string } = {},
): Promise<any> {
  const user = auth.currentUser;
  if (!user) throw new TechnicianCommandError("Autentifică-te din nou.", "blocked");
  const input = JSON.stringify({ action, entityId: options.retryKey || entityId, payload, mutationId: options.mutationId });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input))))
    .map(n => n.toString(16).padStart(2, "0")).join("");
  const key = `fom-command:v1:${auth.app.options.projectId}:${user.uid}:${digest}`;
  let command: Command | undefined;
  try { const saved = sessionStorage.getItem(key); if (saved) command = JSON.parse(saved); } catch { /* unavailable storage */ }
  if (!command) {
    const isWork = !action.startsWith("attendance.") && action !== "request.create";
    const work = isWork ? options.work || (await getDoc(doc(db, "lucrari", entityId))).data() : undefined;
    command = { contractVersion: FOM_CONTRACT_VERSION, mutationId: options.mutationId || crypto.randomUUID(),
      action, entityId, payload: JSON.parse(JSON.stringify(payload)), occurredAt: options.occurredAt || new Date().toISOString(),
      baseVersion: work ? versionOf(work) : null };
    assertCommand(command);
    try { sessionStorage.setItem(key, JSON.stringify(command)); } catch { /* current request still works */ }
  }
  const response = await authenticatedFetch("/api/technician/commands", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
  });
  const result = await response.json();
  if (!response.ok) {
    if (result.kind !== "retryable") { try { sessionStorage.removeItem(key); } catch {} }
    throw new TechnicianCommandError(result.error || "Operația a eșuat.", result.kind || "retryable");
  }
  try { sessionStorage.removeItem(key); } catch {}
  return result;
}

const fileAttempts = new WeakMap<File, { owner: string; id: string; result?: any }>();
export async function technicianFile(file: File, workId = "", purpose = "photo", fileId = crypto.randomUUID()) {
  const owner = `${auth.app.options.projectId}:${auth.currentUser?.uid}:${workId}:${purpose}`;
  let attempt = fileAttempts.get(file);
  if (!attempt || attempt.owner !== owner) { attempt = { owner, id: fileId }; fileAttempts.set(file, attempt); }
  if (attempt.result) return attempt.result;
  fileId = attempt.id;
  const form = new FormData();
  form.set("file", file); form.set("fileId", fileId); form.set("workId", workId); form.set("purpose", purpose);
  const response = await authenticatedFetch("/api/technician/files", { method: "POST", body: form });
  const result = await response.json();
  if (!response.ok) throw new TechnicianCommandError(result.error || "Încărcarea fișierului a eșuat.", result.kind);
  attempt.result = result;
  return result;
}
export async function technicianDocument(workId: string): Promise<Blob> {
  const response = await authenticatedFetch(`/api/technician/document?workId=${encodeURIComponent(workId)}`);
  if (!response.ok) { const result = await response.json(); throw new Error(result.error || "Document indisponibil."); }
  return response.blob();
}
