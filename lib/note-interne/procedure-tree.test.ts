import { test } from "node:test"
import assert from "node:assert/strict"
import { buildProcedureTree, procedureMatches } from "./procedure-tree"
import type { ProcedureNote } from "../../packages/fom-domain/procedures"
const note = (id: string, parentId?: string | null): ProcedureNote => ({ id, parentId, title: id, content: "Text", category: "general", authorName: "Admin", authorId: "admin", createdAt: null, updatedAt: null })

test("legacy roots, nested paths and descendants for safe parent selection", () => {
  const tree = buildProcedureTree([note("root"), note("child", "root"), note("leaf", "child"), note("orphan", "missing")])
  assert.deepEqual(tree.children.get(null)?.map(n => n.id), ["orphan", "root"])
  assert.deepEqual(tree.ancestors("leaf"), ["root", "child"])
  assert.deepEqual([...tree.descendants("root")], ["child", "leaf"])
})

test("cycles and self references remain reachable and traversal terminates", () => {
  const tree = buildProcedureTree([note("a", "b"), note("b", "a"), note("c", "a"), note("self", "self")])
  assert.equal(tree.children.get(null)?.length, 4)
  assert.deepEqual(tree.ancestors("a"), [])
  assert.equal(tree.descendants("a").size, 0)
})

test("global search matches deeply nested rich content without Romanian diacritics", () => {
  const leaf = { ...note("leaf", "child"), content: "<p>Verifică <strong>siguranța</strong> porții</p>" }
  assert.equal(procedureMatches(leaf, "SIGURANTA portii"), true)
  assert.equal(procedureMatches(leaf, "strong"), false)
  assert.equal(procedureMatches(leaf, "siguranta", "urgent"), false)
  assert.equal(procedureMatches(leaf, " "), true)
})
