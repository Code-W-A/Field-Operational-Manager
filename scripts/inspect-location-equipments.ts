/**
 * Diagnostic read-only: pentru un contract, listează pe fiecare locație echipamentele
 * clientului, marcajul din contract și ce a ajuns în revizia generată.
 *
 *   npx tsx scripts/inspect-location-equipments.ts --contract=5/01.03.2023
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
const str = (v: any) => String(v ?? "").trim()
const contractQuery = process.argv.slice(2).find((a) => a.startsWith("--contract="))?.slice("--contract=".length) || ""

async function main() {
  const contractsSnap = await db.collection("contracts").get()
  const contract = contractsSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .find((c) => str(c.number).includes(contractQuery) || c.id === contractQuery)

  if (!contract) {
    console.error("Contract negăsit")
    process.exit(1)
  }

  const selected = new Set<string>((Array.isArray(contract.equipmentIds) ? contract.equipmentIds : []).map(str))
  const clientSnap = await db.collection("clienti").doc(str(contract.clientId)).get()
  const clientData = clientSnap.data() as any

  const worksSnap = await db.collection("lucrari").where("contractId", "==", contract.id).get()
  const works = worksSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as any) }))
    .filter((w) => str(w.tipLucrare).toLowerCase() === "revizie")

  const locationNames: string[] = Array.isArray(contract.locationNames) ? contract.locationNames.map(str) : []
  console.log(`Contract ${str(contract.name)} nr ${str(contract.number)} | bifate=${selected.size} | locații contract=${locationNames.length}`)

  for (const loc of Array.isArray(clientData?.locatii) ? clientData.locatii : []) {
    const locName = str(loc?.nume)
    const eqs = Array.isArray(loc?.echipamente) ? loc.echipamente : []
    const inContract = locationNames.includes(locName)
    const locWorks = works.filter((w) => str(w.locatie) === locName || str(w.locationId) === locName)

    console.log(`\n--- ${locName} ${inContract ? "" : "(NU e în contract)"} | echipamente=${eqs.length} | revizii=${locWorks.length}`)
    for (const eq of eqs) {
      const id = str(eq?.id)
      const cod = str(eq?.cod)
      const marked = (id && selected.has(id)) || (cod && selected.has(cod))
      const inWorks = locWorks
        .filter((w) => (Array.isArray(w.equipmentIds) ? w.equipmentIds.map(str) : []).includes(id))
        .map((w) => str(w.nrLucrare))
      const inStatus = locWorks
        .filter((w) => Object.keys(w.revision?.equipmentStatus || {}).includes(id))
        .map((w) => str(w.nrLucrare))
      console.log(
        `    ${marked ? "[x]" : "[ ]"} ${str(eq?.nume)} (${cod}) id=${id}` +
          ` | eqIds în: ${inWorks.join(",") || "-"} | status în: ${inStatus.join(",") || "-"}`,
      )
    }
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
