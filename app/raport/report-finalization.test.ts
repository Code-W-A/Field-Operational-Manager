import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createContext, runInContext } from "node:vm"
import ts from "typescript"
import { ticketExitHref } from "@/lib/navigation/ticket-origin"

// Execute the real handlers with isolated API/PDF dependencies. This regression
// spans the page's saved state, generator props, error callback and retry path.
function source(path: string) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
}
const page = source("app/raport/[id]/page.tsx")
const generator = source("components/report-generator.tsx")
function find(root: ts.Node, predicate: (node: ts.Node) => boolean): ts.Node[] {
  const matches: ts.Node[] = []
  function visit(node: ts.Node) {
    if (predicate(node)) matches.push(node)
    ts.forEachChild(node, visit)
  }
  visit(root)
  return matches
}
function handler(root: ts.SourceFile, name: string) {
  const node = find(root, n => ts.isVariableDeclaration(n) && n.name.getText(root) === name)[0] as ts.VariableDeclaration
  assert.ok(node, name)
  return (node.initializer as ts.CallExpression).arguments[0].getText(root)
}
const generators = find(page, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(page) === "ReportGenerator") as ts.JsxSelfClosingElement[]
function prop(node: ts.JsxSelfClosingElement, name: string) {
  const attr = node.attributes.properties.find(p => ts.isJsxAttribute(p) && p.name.getText(page) === name) as ts.JsxAttribute
  assert.ok(attr, `ReportGenerator.${name}`)
  return (attr.initializer as ts.JsxExpression).expression!.getText(page)
}
function evaluate(expression: string, context: ReturnType<typeof createContext>) {
  return runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2022 }), context)
}

function fixture(initial: Record<string, unknown> = {}, source: string | null = null) {
  const original = { id: "report-test", statusLucrare: "În lucru", raportGenerat: false, raportDataLocked: false, products: [], ...initial }
  let stored = { ...original }
  let updated: typeof original | null = null
  let pdfFails = false
  const calls = { finalize: 0, document: 0, routes: [] as string[], errors: [] as string[] }
  const quiet = { log() {}, warn() {}, error() {} }
  const context = createContext({
    Error, console: quiet, paramsId: original.id, userData: { role: "tehnician" },
    reportActionLock: { current: false }, isSubmitting: false, isFinalizingLater: false,
    lucrare: original, tichet: original, updatedLucrare: updated,
    validatePaid: () => true, paidDraft: false,
    resolveFailureCauseLabel: () => "Uzură", failureCauseOptions: [],
    cauzaPrincipalaDefectId: "uzura", cauzaPrincipalaDefect: "Uzură",
    techSignatureData: null, clientSignatureData: null,
    techSignatureRef: { current: null }, clientSignatureRef: { current: null },
    numeTehnician: "Test", numeBeneficiar: "Test", products: [],
    clientRating: null, clientReview: "", manualEmails: [], useManualRecipients: false,
    serverTimestamp: () => null,
    toast: (value: { title: string; description: string }) => {
      if (value.title === "Eroare") calls.errors.push(value.description)
    },
    setIsSubmitting: (value: boolean) => { context.isSubmitting = value },
    setUpdatedLucrare: (value: typeof original) => { updated = value },
    technicianCommand: async () => {
      calls.finalize++
      if (stored.raportDataLocked) throw new Error("Tichetul nu mai permite modificări.")
      stored = { ...stored, raportGenerat: true, raportDataLocked: true, statusLucrare: "Finalizat" }
      return { work: { ...stored } }
    },
    exitHref: ticketExitHref(source),
    router: { push: (path: string) => calls.routes.push(path) },
    updateWorkOrderStatus: () => {},
  })
  const generatorContext = createContext({
    Error, console: quiet, readOnly: false, hasGenerated: false,
    userData: context.userData, products: [], clientRating: null, clientReview: "",
    setIsGen() {}, setHasGenerated(value: boolean) { generatorContext.hasGenerated = value },
    technicianCommand: context.technicianCommand, toast: context.toast,
    technicianDocument: async () => {
      calls.document++
      if (pdfFails) throw new Error("PDF temporar indisponibil")
      return { size: 42 }
    },
  })
  const submit = evaluate(handler(page, "handleSubmit"), context)
  const generate = evaluate(handler(generator, "generatePDF"), generatorContext)
  const element = generators[generators.length - 1]
  function render() {
    context.updatedLucrare = updated
    context.tichet = updated ?? original
    generatorContext.lucrare = evaluate(prop(element, "lucrare"), context)
    generatorContext.onError = evaluate(prop(element, "onError"), context)
    generatorContext.onGenerate = evaluate(prop(element, "onGenerate"), context)
  }
  let pending: Promise<unknown> | undefined
  context.reportGeneratorRef = { current: { click: () => { pending = generate() } } }
  render()
  return {
    calls, context, submit,
    failPdf(value: boolean) { pdfFails = value },
    async generateSaved() { render(); await generate(); await new Promise(resolve => setImmediate(resolve)) },
    async retry() { render(); await submit(); await pending; await new Promise(resolve => setImmediate(resolve)) },
  }
}

test("finalizing once passes confirmed work to PDF generation", async () => {
  const f = fixture()
  await f.submit()
  await f.generateSaved()
  assert.equal(f.calls.finalize, 1)
  assert.equal(f.calls.document, 1)
  assert.deepEqual(f.calls.errors, [])
  assert.deepEqual(f.calls.routes, ["/dashboard/lucrari"])
  assert.equal(f.context.isSubmitting, false)
})

test("PDF failure releases processing; retry retrieves document without refinalizing", async () => {
  const f = fixture()
  await f.submit()
  f.failPdf(true)
  await f.generateSaved()
  assert.equal(f.context.isSubmitting, false)
  assert.deepEqual(f.calls.errors, ["PDF temporar indisponibil"])
  assert.deepEqual(f.calls.routes, [])
  f.failPdf(false)
  await f.retry()
  assert.equal(f.calls.finalize, 1)
  assert.equal(f.calls.document, 2)
  assert.equal(f.context.isSubmitting, false)
  assert.deepEqual(f.calls.routes, ["/dashboard/lucrari"])
})

for (const initial of [{ raportGenerat: true }, { raportDataLocked: true }]) {
  test(`existing report ${JSON.stringify(initial)} only retrieves PDF`, async () => {
    const f = fixture(initial)
    // Historical reports need no new form validation to retrieve their PDF.
    f.context.validatePaid = () => { throw new Error("Should not validate a finalized report") }
    await f.retry()
    assert.equal(f.calls.finalize, 0)
    assert.equal(f.calls.document, 1)
    assert.deepEqual(f.calls.errors, [])
    assert.equal(f.context.isSubmitting, false)
  })
}

test("both PDF interfaces receive latest work and release processing on errors", () => {
  assert.equal(generators.length, 2)
  for (const element of generators) {
    const context = createContext({ tichet: { raportGenerat: true }, isSubmitting: true })
    context.setIsSubmitting = (value: boolean) => { context.isSubmitting = value }
    assert.equal(evaluate(prop(element, "lucrare"), context), context.tichet)
    evaluate(prop(element, "onError"), context)(new Error("PDF failed"))
    assert.equal(context.isSubmitting, false)
  }
})


test("Dashboard report returns to its origin after PDF success and stays on generation failure", async () => {
  const f = fixture({}, "dashboard")
  await f.submit()
  f.failPdf(true)
  await f.generateSaved()
  assert.deepEqual(f.calls.routes, [])
  f.failPdf(false)
  await f.retry()
  assert.deepEqual(f.calls.routes, ["/dashboard"])
})
