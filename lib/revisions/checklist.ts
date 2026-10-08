import { collection, onSnapshot } from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { checklistFromSettings } from "@/packages/fom-domain"
import type { RevisionChecklist } from "@/types/revision"

function subscribeChecklist(callback: (checklist: RevisionChecklist) => void, rootId?: string): () => void {
  return onSnapshot(collection(db, "settings"), snapshot => {
    const settings = snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id }))
    callback({ version: JSON.stringify(settings), sections: checklistFromSettings(settings, rootId), states: ["Functional", "Nefunctional"] })
  })
}
export function subscribeRevisionChecklist(callback: (checklist: RevisionChecklist) => void): () => void {
  return subscribeChecklist(callback)
}
export function subscribeRevisionChecklistFromRoot(rootId: string, callback: (checklist: RevisionChecklist) => void): () => void {
  return subscribeChecklist(callback, rootId.trim())
}

/**
 * Convenience: get checklist once. Useful at work creation to snapshot version id.
 */
export function getRevisionChecklistOnce(): Promise<RevisionChecklist> {
  return new Promise((resolve) => {
    const unsub = subscribeRevisionChecklist((c) => {
      resolve(c)
      unsub()
    })
  })
}


