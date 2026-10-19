import { arrayUnion, deleteField, FieldValue, serverTimestamp } from "firebase/firestore";
import type { InstallationManagementInput } from "./management";

const unions = new WeakMap<FieldValue, unknown[]>();

/** Preserve native Firestore behavior and retain append data for the installation API. */
export function workArrayUnion(...values: unknown[]) {
  const transform = arrayUnion(...values);
  unions.set(transform, values);
  return transform;
}

export function installationManagementInput(patch: Record<string, unknown>): InstallationManagementInput {
  const input: InstallationManagementInput = { work: {} };
  for (const [key, value] of Object.entries(patch)) {
    if (value instanceof FieldValue) {
      const appended = unions.get(value);
      if (appended) (input.append ??= {})[key] = appended;
      else if (value.isEqual(deleteField())) (input.remove ??= []).push(key);
      else if (value.isEqual(serverTimestamp())) (input.serverTime ??= []).push(key);
      else throw new Error("Actualizarea conține o transformare nesuportată pentru instalare.");
    } else if (value !== undefined) input.work[key] = value;
  }
  return input;
}
