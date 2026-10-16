import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"
import React from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { WORK_TYPES } from "@/lib/utils/constants"

// Execute the actual handlers/renderers without a production Firebase connection.
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
const list = source("app/dashboard/lucrari/page.tsx")
const details = source("app/dashboard/lucrari/[id]/page.tsx")
function find(file: ts.SourceFile, predicate: (node: ts.Node) => boolean): ts.Node {
  let found: ts.Node | undefined
  function visit(node: ts.Node) {
    if (!found && predicate(node)) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(file)
  assert.ok(found, "Source function must exist")
  return found
}
function declaration(file: ts.SourceFile, name: string) {
  const node = find(file, n => ts.isVariableDeclaration(n) && n.name.getText(file) === name)
  return `const ${node.getText(file)};`
}
function execute(body: string, scope: Record<string, unknown> = {}) {
  const js = ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React } }).outputText
  return runInNewContext(js, { React, useCallback: (fn: unknown) => fn, ...scope })
}

test("admin and dispatcher table actions render without an undefined lucrare parameter", () => {
  const actions = find(list, n => ts.isObjectLiteralExpression(n) && n.properties.some(p =>
    ts.isPropertyAssignment(p) && p.name.getText(list) === "id" && p.initializer.getText(list) === '"actions"')) as ts.ObjectLiteralExpression
  const cell = actions.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(list) === "cell") as ts.PropertyAssignment
  const wrapper = ({ children }: any) => React.createElement(React.Fragment, null, children)
  const button = ({ children, onClick, disabled, ...props }: any) => React.createElement("button", { "aria-label": props["aria-label"], disabled }, children)
  const icon = () => React.createElement("span")
  for (const role of ["admin", "dispecer", "tehnician"]) for (const lockedAfterReintervention of [false, true]) {
    const render = execute(`${declaration(list, "needsReassignment")}\n(${cell.initializer.getText(list)});`, {
      isTechnician: role === "tehnician", canDeleteWorks: role === "admin", isCompletedWithReportNotPickedUp: () => false,
      Tooltip: wrapper, TooltipTrigger: wrapper, TooltipContent: wrapper, Button: button,
      Eye: icon, FileText: icon, Pencil: icon, Trash2: icon, RefreshCw: icon,
    })
    const markup = renderToStaticMarkup(render({ row: { original: { id: "work", statusLucrare: "În lucru", lockedAfterReintervention } } }))
    assert.ok(markup.includes('aria-label="Generează raport"'))
    assert.equal(markup.includes('aria-label="Editează tichetul"'), role !== "tehnician")
    assert.equal(markup.includes('aria-label="Șterge tichetul"'), role === "admin")
  }
})

test("reintervention uses the original lucrare and keeps the canonical form fields", async () => {
  let saved: any, originalId: string | undefined, opened = false
  const errors: unknown[] = []
  const work = { id: "original", client: "Client", locatie: "Sediu", dataInterventie: "16.10.2026", echipament: "Ușă", defectReclamat: "Defect inițial" }
  const handler = execute(`${declaration(list, "handleReassign")}\nhandleReassign;`, {
    WORK_TYPES, prepareReinterventionContact: async (input: any) => { assert.equal(input, work); return { clientId: "client", locationId: "loc" } },
    setFormData: (value: any) => { saved = value }, setIsReassignment: () => {},
    setOriginalWorkOrderId: (id: string) => { originalId = id }, setFieldErrors: () => {},
    setIsAddDialogOpen: (value: boolean) => { opened = value }, toast: (value: unknown) => errors.push(value), console,
  })
  await handler(work)
  assert.equal(errors.length, 0)
  assert.equal(saved.tipLucrare, WORK_TYPES.RE_INTERVENTION)
  assert.equal(saved.statusLucrare, "Listată")
  assert.equal(saved.clientId, "client")
  assert.equal(saved.locationId, "loc")
  assert.equal(saved.client, work.client)
  assert.equal(originalId, work.id)
  assert.equal(opened, true)
})

test("detail helpers read the supplied lucrare for duration and reintervention", () => {
  const duration = execute(`${declaration(details, "calculateInterventionDuration")}\ncalculateInterventionDuration;`)
  assert.equal(duration({ durataInterventie: "0h 20m" }), "0h 20m")
  const needs = execute(`${declaration(details, "needsReintervention")}\nneedsReintervention;`, {
    isLucrareAnulata: (work: any) => work.statusLucrare === "Anulată",
  })
  assert.equal(needs({ preluatDispecer: true, raportGenerat: true }), true)
  assert.equal(needs({ preluatDispecer: true, raportGenerat: true, statusLucrare: "Anulată" }), false)
  assert.equal(needs({ preluatDispecer: false, raportGenerat: true }), false)
})
