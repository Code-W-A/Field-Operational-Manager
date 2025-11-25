import { subscribeToSettings, subscribeToSettingsByTarget } from "@/lib/firebase/settings"
import type { RevisionChecklist, RevisionChecklistSection } from "@/types/revision"

/**
 * Builds the revision checklist structure from Settings.
 * Admin must create top-level sections bound to target `revisions.checklist.sections`,
 * and inside each section create variables (one per control point).
 *
 * Supports 2 or 3 levels:
 * - 2-level: Parent (bound to target) → variables (items)
 * - 3-level: Parent (bound to target) → categories → variables (items)
 *   In this case, each category becomes its own ChecklistSection (using the category name as title).
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

    // Track nested subscriptions for each parent (children level; we detect categories by grandchildren)
    const parentChildUnsubs: Record<string, Array<() => void>> = {}
    // Sections map that we rebuild incrementally from subscriptions
    const sectionsMap: Record<string, RevisionChecklistSection> = {}
    // Keep latest child order per parent for deterministic ordering
    const parentChildOrder: Record<string, string[]> = {}

    // Publish helper: compute ordered sections list and push to callback
    const publish = () => {
      const orderedParents = parents.slice().sort((a, b) => (a.order || 0) - (b.order || 0))
      const result: RevisionChecklistSection[] = []
      for (const p of orderedParents) {
        // 1) Parent-root variables section (if any)
        const rootKey = `${p.id}__root`
        const rootSec = sectionsMap[rootKey]
        if (rootSec && rootSec.items.length > 0) {
          result.push(rootSec)
        }
        // 2) Category sections in stored child order
        const childOrder = parentChildOrder[p.id] || []
        for (const childId of childOrder) {
          const sec = sectionsMap[childId]
          if (sec && sec.items.length > 0) {
            result.push(sec)
          }
        }
      }
      callback({
        version: new Date().toISOString(),
        sections: result,
        states: ["Functional", "Nefunctional"],
      })
    }

    // For each parent, subscribe to its children and then to their children to detect categories
    const directChildUnsubs: Array<() => void> = []
    parents.forEach((p) => {
      const unsub = subscribeToSettings(p.id, (children) => {
        // Reset previous child subscriptions for this parent
        parentChildUnsubs[p.id]?.forEach((u) => u && u())
        parentChildUnsubs[p.id] = []

        // Maintain a root items collection that we'll compute from children that have NO variable grandchildren
        const rootItems: Array<{ id: string; label: string }> = []

        // Track child order for deterministic section ordering
        parentChildOrder[p.id] = children
          .slice()
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((c: any) => c.id)

        // For each child, subscribe to determine if it acts as a category (has variable grandchildren)
        children.forEach((child: any) => {
          const u = subscribeToSettings(child.id, (grandChildren) => {
            const vars = (grandChildren || []).filter((gc: any) => gc.type === "variable")
            if (vars.length > 0) {
              // Child is a category → create/update section with grandchild variables
              sectionsMap[child.id] = {
                id: child.id,
                title: child.name,
                items: vars.map((gc: any) => ({ id: gc.id, label: gc.name })),
              }
            } else {
              // Child is a leaf variable → ensure it's in root items and remove any stale section
              sectionsMap[child.id] && delete sectionsMap[child.id]
              // Add to root items (avoid duplicates)
              if (!rootItems.find((ri) => ri.id === child.id) && child.type === "variable") {
                rootItems.push({ id: child.id, label: child.name })
              }
            }

            // Update root section for this parent based on current rootItems + any children detected as leaves so far
            const rootKey = `${p.id}__root`
            if (rootItems.length > 0) {
              sectionsMap[rootKey] = {
                id: rootKey,
                title: p.name,
                items: rootItems,
              }
            } else {
              delete sectionsMap[rootKey]
            }

            publish()
          })
          parentChildUnsubs[p.id].push(u)
        })

        publish()
      })
      directChildUnsubs.push(unsub)
    })

    // When parents change, clean up both direct and category subscriptions
    return () => {
      directChildUnsubs.forEach((u) => u && u())
      Object.values(parentChildUnsubs).forEach((arr) => arr.forEach((u) => u && u()))
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
 * Subscribe to a specific checklist tree starting from a concrete Settings parent (rootId).
 * This allows per‑equipment templates by pointing to a custom root category instead of the global target.
 *
 * Structure supported is identical cu subscribeRevisionChecklist:
 * - Root (parentId = rootId)
 * - Children can be either:
 *   - variables (becoming items în secțiunea root)
 *   - categories (children with variables) – fiecare categorie devine o secțiune separată
 */
export function subscribeRevisionChecklistFromRoot(
  rootId: string,
  callback: (checklist: RevisionChecklist) => void
): () => void {
  // Track nested subscriptions for each child of the provided root
  const childUnsubs: Array<() => void> = []
  // Sections map that we rebuild incrementally from subscriptions
  const sectionsMap: Record<string, RevisionChecklistSection> = {}
  // Keep current root variables (items that live directly under root)
  let rootItems: Array<{ id: string; label: string }> = []
  // Child order to keep deterministic rendering
  let childOrder: string[] = []

  const publish = (rootName: string) => {
    const result: RevisionChecklistSection[] = []
    // 1) Root section from variables directly under root
    if (rootItems.length > 0) {
      result.push({
        id: `${rootId}__root`,
        title: rootName,
        items: rootItems,
      })
    }
    // 2) Category sections in stored child order
    for (const cId of childOrder) {
      const sec = sectionsMap[cId]
      if (sec && sec.items.length > 0) {
        result.push(sec)
      }
    }
    callback({
      version: new Date().toISOString(),
      sections: result,
      states: ["Functional", "Nefunctional"],
    })
  }

  // Subscribe to direct children of root
  const unsubRoot = subscribeToSettings(rootId, (children) => {
    // Reset previous child listeners
    childUnsubs.forEach((u) => u && u())
    childUnsubs.length = 0
    // Reset accumulators
    rootItems = []
    childOrder = (children || [])
      .slice()
      .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
      .map((c: any) => c.id)

    // Determine root name (fallback la path/id dacă lipsește)
    const rootName =
      (children && children.length > 0 && children[0]?.parentName) ||
      // Some UIs might not supply parentName; fallback to first child's parent inferred name or placeholder
      "Puncte de control"

    children.forEach((child: any) => {
      const u = subscribeToSettings(child.id, (grandChildren) => {
        const vars = (grandChildren || []).filter((gc: any) => gc.type === "variable")
        if (vars.length > 0) {
          // L1 category with direct variables → one section
          sectionsMap[child.id] = {
            id: child.id,
            title: child.name,
            items: vars.map((gc: any) => ({ id: gc.id, label: gc.name })),
          }
          publish(rootName)
          return
        }

        // No direct variables; look one level deeper (child → subcategory → variables)
        // Clear any stale section for current child
        sectionsMap[child.id] && delete sectionsMap[child.id]

        // If child itself is a variable → treat as root item
        if (child.type === "variable") {
          if (!rootItems.find((ri) => ri.id === child.id)) {
            rootItems.push({ id: child.id, label: child.name })
          }
          publish(rootName)
          return
        }

        // Track subcategory subscriptions for this child
        // We will aggregate subcategory sections under their own IDs
        // and keep their order according to grandChildren order.
        const subOrders = (grandChildren || [])
          .slice()
          .sort((a: any, b: any) => (a.order || 0) - (b.order || 0))
          .map((gc: any) => gc.id)

        // For each grandChild (potential subcategory), subscribe and build section if it has variables
        subOrders.forEach((gcId) => {
          const gc = (grandChildren || []).find((x: any) => x.id === gcId)
          if (!gc) return
          const u2 = subscribeToSettings(gc.id, (greatGrandChildren) => {
            const subVars = (greatGrandChildren || []).filter((gg: any) => gg.type === "variable")
            if (subVars.length > 0) {
              // Create/update section for subcategory
              sectionsMap[gc.id] = {
                id: gc.id,
                title: gc.name || gc.path || gc.id,
                items: subVars.map((gg: any) => ({ id: gg.id, label: gg.name })),
              }
            } else {
              // No variables under subcategory → remove stale section
              sectionsMap[gc.id] && delete sectionsMap[gc.id]
            }
            publish(rootName)
          })
          childUnsubs.push(u2)
        })

        publish(rootName)
      })
      childUnsubs.push(u)
    })

    publish(rootName)
  })

  return () => {
    try {
      unsubRoot?.()
    } catch {}
    childUnsubs.forEach((u) => u && u())
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


