import type { ProcedureNote } from "../../packages/fom-domain/procedures"
import { stripHtml } from "./procedure-content-html"

export function normalizeProcedureSearch(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("ro").trim()
}

/** Missing parents and legacy/cyclic data remain reachable without a migration. */
export function buildProcedureTree<T extends ProcedureNote>(notes: T[]) {
  const byId = new Map(notes.map(note => [note.id, note]))
  const parents = new Map<string, string | null>()
  for (const note of notes) {
    const seen = new Set([note.id])
    let parent = note.parentId
    while (parent && byId.has(parent) && !seen.has(parent)) {
      seen.add(parent)
      parent = byId.get(parent)?.parentId
    }
    parents.set(note.id, parent && seen.has(parent) ? null :
      note.parentId && byId.has(note.parentId) ? note.parentId : null)
  }
  const children = new Map<string | null, T[]>()
  for (const note of notes) {
    const parent = parents.get(note.id) ?? null
    const siblings = children.get(parent) ?? []
    siblings.push(note)
    children.set(parent, siblings)
  }
  for (const siblings of children.values()) siblings.sort((a, b) => a.title.localeCompare(b.title, "ro", { numeric: true }))
  const ancestors = (id: string) => {
    const result: string[] = []
    let parent = parents.get(id)
    while (parent) {
      result.unshift(parent)
      parent = parents.get(parent)
    }
    return result
  }
  const descendants = (id: string): Set<string> => {
    const result = new Set<string>()
    const visit = (parent: string) => {
      for (const child of children.get(parent) ?? []) {
        result.add(child.id)
        visit(child.id)
      }
    }
    visit(id)
    return result
  }
  return { byId, children, ancestors, descendants }
}

export function procedureMatches(note: ProcedureNote, search: string, category = "all") {
  const term = normalizeProcedureSearch(search)
  return (category === "all" || note.category === category) &&
    (!term || normalizeProcedureSearch(`${note.title} ${stripHtml(note.content)} ${note.authorName}`).includes(term))
}
