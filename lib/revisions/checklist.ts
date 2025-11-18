import { subscribeToSettings, subscribeToSettingsByTarget } from "@/lib/firebase/settings"
import type { RevisionChecklist, RevisionChecklistSection } from "@/types/revision"

/**
 * Builds the revision checklist structure from Settings.
 * Admin must create top-level sections bound to target `revisions.checklist.sections`,
 * and inside each section create variables (one per control point).
 */
export function subscribeRevisionChecklist(
  callback: (checklist: RevisionChecklist) => void
): () => void {
  // Subscribe to parents (sections) first
  const unsubParents = subscribeToSettingsByTarget("revisions.checklist.sections", (parents) => {
    if (!parents.length) {
      callback({
        version: "empty",
        sections: [],
        states: ["Functional", "Nefunctional", "N/A"],
      })
      return
    }
    // For each parent, subscribe to its children
    const childUnsubs: Array<() => void> = []
    const sections: Record<string, RevisionChecklistSection> = {}
    parents.forEach((p) => {
      sections[p.id] = { id: p.id, title: p.name, items: [] }
      const unsub = subscribeToSettings(p.id, (children) => {
        sections[p.id] = {
          id: p.id,
          title: p.name,
          items: children
            .filter((c) => c.type === "variable")
            .map((c) => ({ id: c.id, label: c.name })),
        }
        const ordered = parents
          .slice()
          .sort((a, b) => (a.order || 0) - (b.order || 0))
          .map((s) => sections[s.id])
          .filter(Boolean) as RevisionChecklistSection[]
        callback({
          version: new Date().toISOString(), // simple version marker tied to subscription updates
          sections: ordered,
          states: ["Functional", "Nefunctional"], // app uses 2-state dropdown by default
        })
      })
      childUnsubs.push(unsub)
    })
    // When parents change, clean up children subscriptions
    return () => {
      childUnsubs.forEach((u) => u && u())
    }
  })
  return () => {
    try {
      unsubParents()
    } catch {
      // noop
    }
  }
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


