/**
 * Diagnostic read-only: compară echipamentele bifate pe contract cu echipamentele
 * din reviziile generate automat (`createdBy: "system"`).
 *
 *   npx tsx scripts/inspect-contract-revision-equipments.ts
 *   npx tsx scripts/inspect-contract-revision-equipments.ts --contract=5/01.03.2023 --verbose
 */

import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore } from "firebase-admin/firestore"

function loadDotEnv(filePath: string) {
  if (!fs.existsSync(filePath)) return
  const content = fs.readFileSync(filePath, "utf8")
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue
    const index = line.indexOf("=")
    if (index <= 0) continue
    const key = line.slice(0, index).trim()
    const raw = line.slice(index + 1).trim()
    if (!key || process.env[key]) continue
    process.env[key] = raw.replace(/^"|"$/g, "")
  }
}

loadDotEnv(path.resolve(process.cwd(), ".env"))

const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL
const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n")

if (!projectId || !clientEmail || !privateKey) {
  console.error("Lipsesc NEXT_PUBLIC_FIREBASE_PROJECT_ID sau FIREBASE_ADMIN_* în .env")
  process.exit(1)
}

if (!getApps().length) {
  initializeApp({ credential: cert({ projectId, clientEmail, privateKey }), projectId })
}

const db = getFirestore()

const args = process.argv.slice(2)
const contractQuery = args.find((a) => a.startsWith("--contract="))?.slice("--contract=".length) || ""
const verbose = args.includes("--verbose")

const str = (v: any) => String(v ?? "").trim()

async function main() {
  const [contractsSnap, worksSnap, clientsSnap] = await Promise.all([
    db.collection("contracts").get(),
    db.collection("lucrari").where("tipLucrare", "==", "Revizie").get(),
    db.collection("clienti").get(),
  ])

  const contracts = contractsSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const works = worksSnap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }))
  const clients = new Map(clientsSnap.docs.map((d) => [d.id, d.data() as any]))

  const worksByContract = new Map<string, any[]>()
  for (const w of works) {
    const key = str(w.contractId) || str(w.contract)
    if (!key) continue
    const list = worksByContract.get(key) || []
    list.push(w)
    worksByContract.set(key, list)
  }

  const matched = contractQuery
    ? contracts.filter(
        (c) =>
          str(c.number).includes(contractQuery) ||
          str(c.name).toLowerCase().includes(contractQuery.toLowerCase()) ||
          c.id === contractQuery,
      )
    : contracts

  console.log(`Contracte: ${matched.length}/${contracts.length} | Revizii totale: ${works.length}`)

  let totalOffenders = 0
  let totalStatusMismatch = 0

  for (const contract of matched) {
    const equipmentIds: string[] = Array.isArray(contract.equipmentIds) ? contract.equipmentIds.map(str) : []
    const selected = new Set(equipmentIds)
    const clientData = contract.clientId ? clients.get(str(contract.clientId)) : null

    const allEquipments: { loc: string; id: string; cod: string; nume: string }[] = []
    for (const loc of Array.isArray(clientData?.locatii) ? clientData.locatii : []) {
      for (const eq of Array.isArray(loc?.echipamente) ? loc.echipamente : []) {
        allEquipments.push({ loc: str(loc?.nume), id: str(eq?.id), cod: str(eq?.cod), nume: str(eq?.nume) })
      }
    }
    const describe = (id: string) => {
      const eq = allEquipments.find((e) => e.id === id || e.cod === id)
      return eq ? `${eq.nume} (${eq.cod}) @ ${eq.loc}` : "(nu mai există la client)"
    }

    const contractWorks = worksByContract.get(contract.id) || []
    const offenders: any[] = []
    const statusMismatch: any[] = []

    for (const w of contractWorks) {
      const wIds: string[] = Array.isArray(w.equipmentIds) ? w.equipmentIds.map(str) : []
      const statusKeys = Object.keys(w.revision?.equipmentStatus || {}).map(str)
      const notInContract = equipmentIds.length > 0 ? wIds.filter((id) => !selected.has(id)) : []
      const extraStatus = statusKeys.filter((id) => !wIds.includes(id))
      if (notInContract.length) offenders.push({ w, notInContract })
      if (extraStatus.length) statusMismatch.push({ w, extraStatus })
    }

    totalOffenders += offenders.length
    totalStatusMismatch += statusMismatch.length

    if (!verbose && offenders.length === 0 && statusMismatch.length === 0) continue

    console.log("\n==============================")
    console.log(`Contract ${contract.id} — ${str(contract.name)} / nr ${str(contract.number)}`)
    console.log(`  bifate: ${equipmentIds.length} | echipamente client: ${allEquipments.length} | revizii: ${contractWorks.length}`)
    console.log(`  contract.updatedAt: ${contract.updatedAt?.toDate?.()?.toISOString?.() ?? str(contract.updatedAt)}`)

    for (const { w, notInContract } of offenders) {
      console.log(
        `  [equipmentIds nebifate] #${str(w.nrLucrare)} ${str(w.locatie)} createdAt=${w.createdAt?.toDate?.()?.toISOString?.() ?? "?"} emis=${str(w.dataEmiterii)}`,
      )
      for (const id of notInContract) console.log(`      ! ${id} = ${describe(id)}`)
    }
    for (const { w, extraStatus } of statusMismatch) {
      console.log(
        `  [equipmentStatus în plus] #${str(w.nrLucrare)} ${str(w.locatie)} createdAt=${w.createdAt?.toDate?.()?.toISOString?.() ?? "?"} eqIds=${(w.equipmentIds || []).length} status=${Object.keys(w.revision?.equipmentStatus || {}).length}`,
      )
      for (const id of extraStatus) console.log(`      + ${id} = ${describe(id)}`)
    }
  }

  console.log(
    `\nTOTAL: ${totalOffenders} revizii cu echipamente nebifate în equipmentIds, ${totalStatusMismatch} revizii cu equipmentStatus în plus`,
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
