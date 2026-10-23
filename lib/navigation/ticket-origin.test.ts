import test from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createContext, runInContext } from "node:vm"
import ts from "typescript"
import { ticketExitHref, withTicketOrigin } from "./ticket-origin"

const ticketPath = "app/dashboard/lucrari/[id]/page.tsx"
const revisionPath = "app/dashboard/lucrari/[id]/revizie/[equipmentId]/page.tsx"
const workspacePath = "components/installation-workspace.tsx"
function handler(path: string, name: string) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let result = ""
  function visit(node: ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name && node.initializer) {
      const init = node.initializer
      result = (ts.isCallExpression(init) ? init.arguments[0] : init).getText(source)
    }
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) result = node.getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(result, `Missing handler ${name}`)
  return result
}
function evaluate(expression: string, context: Record<string, unknown>) {
  return runInContext(ts.transpile(`(${expression})`, { target: ts.ScriptTarget.ES2022 }), createContext(context))
}

test("Dashboard overrides exits; other entries keep their existing destinations", () => {
  for (const fallback of ["/dashboard/lucrari", "/dashboard/arhivate", "/dashboard/arhivate/w"]) {
    assert.equal(ticketExitHref("dashboard", fallback), "/dashboard")
    for (const source of [null, "arhivate", "istoric-echipament", "https://example.com"]) {
      assert.equal(ticketExitHref(source, fallback), fallback)
    }
  }
})

test("Origin survives report, revision, installation tabs and reload without losing query/hash", () => {
  for (const source of ["dashboard", "arhivate", "istoric-echipament"]) {
    for (const path of ["/raport/w", "/dashboard/lucrari/w/revizie/e", "/dashboard/lucrari/w/instalare?tab=sheets&sheetId=s&complete=1#form"]) {
      const first = withTicketOrigin(path, source)
      const url = new URL(first, "http://localhost")
      assert.equal(url.searchParams.get("from"), source)
      assert.equal(withTicketOrigin(first, source), first)
      if (path.includes("sheetId")) {
        assert.equal(url.searchParams.get("sheetId"), "s")
        assert.equal(url.searchParams.get("tab"), "sheets")
        assert.equal(url.hash, "#form")
      }
    }
  }
  assert.equal(withTicketOrigin("/raport/w?autoDownload=true", null), "/raport/w?autoDownload=true")
  assert.equal(withTicketOrigin("/raport/w", "untrusted"), "/raport/w")
})

for (const name of ["handleDeleteLucrare", "handleCancelWorkOrder"]) {
  test(`${name}: navigate only after success, stay on write failure`, async () => {
    for (const fails of [false, true]) {
      const routes: string[] = []
      let confirmed = false
      const mutate = async () => { if (fails) throw new Error("write failed"); confirmed = true }
      const noop = () => {}
      const run = evaluate(handler(ticketPath, name), {
        role: "admin", isAdminOrDispatcher: true, isAdmin: true,
        lucrare: { id: "w" }, userData: { uid: "u", displayName: "Admin" },
        cancelReason: "Motiv", isCancelling: false, setIsCancelling: noop,
        deleteLucrare: mutate, updateLucrare: mutate,
        WORK_STATUS: { ARCHIVED: "Arhivată" }, serverTimestamp: () => null,
        setLucrare: noop, setIsCancelDialogOpen: noop, setCancelReason: noop,
        toast: noop, console: { error: noop }, exitHref: "/dashboard", fromSource: "dashboard", ticketExitHref,
        router: { push: (url: string) => { assert.ok(confirmed); routes.push(url) } },
      })
      await run()
      assert.deepEqual(routes, fails ? [] : ["/dashboard"])
    }
  })
}

test("Revision returns to ticket with origin and leaves only on successful draft save", async () => {
  for (const saved of [false, true]) {
    const routes: string[] = []
    const context = {
      workId: "w", source: "dashboard", withTicketOrigin,
      leavingRef: { current: false }, hasUnsavedChangesRef: { current: true },
      saveAndLeaveLock: { current: false }, saveDraftRef: { current: async () => saved },
      setShowUnsavedDialog() {}, setSavingAndLeaving() {},
      router: { replace: (href: string) => routes.push(href) },
    }
    const vm = createContext(context)
    for (const name of ["leaveForWork", "handleSaveAndBack"]) {
      runInContext(`var ${name} = ${ts.transpile(`(${handler(revisionPath, name)})`, { target: ts.ScriptTarget.ES2022 })}`, vm)
    }
    await vm.handleSaveAndBack()
    assert.deepEqual(routes, saved ? ["/dashboard/lucrari/w?from=dashboard"] : [])
  }
})

test("Installation termination retains defaults and does not leave on API failure", async () => {
  for (const source of [null, "dashboard", "arhivate"]) {
    for (const confirmation of ["archive", "cancel", "delete"]) {
      for (const fails of [false, true]) {
        const routes: string[] = []
        const noop = () => {}
        const run = evaluate(handler(workspacePath, "terminate"), {
          source, confirmation, workId: "w", cancelReason: "Motiv",
          terminationPending: { current: false }, setTerminating: noop, setActionError: noop,
          installationApi: () => "/test", installationRequest: async () => { if (fails) throw new Error("API failed") },
          toast: noop, setConfirmation: noop, ticketExitHref,
          router: { push: (href: string) => routes.push(href) },
        })
        await run()
        assert.deepEqual(routes, fails ? [] : [source === "dashboard" ? "/dashboard" : confirmation === "delete" ? "/dashboard/lucrari" : "/dashboard/arhivate/w"])
      }
    }
  }
})
