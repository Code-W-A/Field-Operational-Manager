import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

// Exercise the actual scheduler query, without initializing Firebase or registering triggers.
const source = readFileSync('firebase-functions/src/index.ts', 'utf8')
const ast = ts.createSourceFile('index.ts', source, ts.ScriptTarget.Latest, true)
const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'workExists')!
const compiled = ts.transpileModule(declaration.getText(ast), {compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText
function scheduler(rows: Record<string, unknown>[]) {
  const query = (filters: [string,unknown][] = []): any => ({
    where: (field:string, _operator:string, value:unknown) => query([...filters,[field,value]]),
    limit: () => query(filters),
    get: async () => ({empty:!rows.some(row=>filters.every(([key,value])=>row[key]===value))}),
  })
  return new Function('db',compiled+'\nreturn workExists;')({collection:()=>query()})
}

test('scheduler finds both repaired stable IDs and legacy names under either contract field', async () => {
  for (const field of ['contract','contractId']) for (const id of ['real-location-id','Cladire Admin']) {
    const exists=scheduler([{[field]:'contract',locationId:id,dataInterventie:'date'}])
    assert.equal(await exists('contract','real-location-id','date','Cladire Admin'),true)
    assert.equal(await exists('contract','different-location','date','Other'),false)
    assert.equal(await exists('contract','real-location-id','different-date','Cladire Admin'),false)
  }
})
