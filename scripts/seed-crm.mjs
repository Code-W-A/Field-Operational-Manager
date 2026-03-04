#!/usr/bin/env node
import fs from "node:fs"
import path from "node:path"
import process from "node:process"
import { initializeApp, cert, getApps } from "firebase-admin/app"
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore"

function loadDotEnv(filePath) {
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
  throw new Error("Lipsesc variabilele FIREBASE_ADMIN_* sau NEXT_PUBLIC_FIREBASE_PROJECT_ID în .env")
}

if (!getApps().length) {
  initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
    projectId,
  })
}

const db = getFirestore()

async function createOpportunity({ title, type, stage, ownerId, clientId, number }) {
  const code = `OP${String(number).padStart(6, "0")}`
  const opportunityRef = db.collection("crm_opportunities").doc()

  await opportunityRef.set({
    number,
    code,
    title,
    displayTitle: `${code} - ${title}`,
    clientId,
    ownerId,
    priority: "MEDIUM",
    workStatus: "OPEN",
    pipelineStage: stage,
    opportunityType: type,
    amount: null,
    closeDate: null,
    wonAt: null,
    lostAt: null,
    lostReason: null,
    createdById: ownerId,
    updatedById: ownerId,
    readUserIds: [ownerId],
    editUserIds: [ownerId],
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await db.collection("crm_tasks").add({
    opportunityId: opportunityRef.id,
    title: "Contactare lead",
    status: "TODO",
    dueAt: Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    reminderAt: Timestamp.fromDate(new Date(Date.now() + 22 * 60 * 60 * 1000)),
    assigneeId: ownerId,
    createdById: ownerId,
    visibility: "GENERAL",
    visibleToUserIds: [],
    automationKey: "seed_initial_contact",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  await db.collection("crm_activity_logs").add({
    opportunityId: opportunityRef.id,
    actorId: ownerId,
    type: "CREATED",
    payload: {
      code,
      stage,
      seed: true,
    },
    visibility: "GENERAL",
    visibleToUserIds: [],
    createdAt: FieldValue.serverTimestamp(),
  })

  return { id: opportunityRef.id, code }
}

async function main() {
  const usersSnapshot = await db.collection("users").limit(5).get()
  if (usersSnapshot.empty) {
    throw new Error("Nu există utilizatori în colecția users pentru owner seed")
  }

  const ownerId = usersSnapshot.docs[0].id

  const clientRef = db.collection("crm_clients").doc()
  await clientRef.set({
    name: "Asociația de proprietari Cloud 9",
    type: "Persoană juridică",
    address: "Str. Cloud 9, București",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const contact1Ref = await db.collection("crm_client_contacts").add({
    clientId: clientRef.id,
    name: "Bogdan Ionescu",
    phone: "0722000001",
    email: "bogdan@cloud9.ro",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const contact2Ref = await db.collection("crm_client_contacts").add({
    clientId: clientRef.id,
    name: "Andreea Pop",
    phone: "0722000002",
    email: "andreea@cloud9.ro",
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  })

  const counterRef = db.collection("crm_counters").doc("opportunity")
  const counterSnap = await counterRef.get()
  let nextNumber = Number(counterSnap.data()?.nextNumber || 0)

  const opportunityA = await createOpportunity({
    title: "Sistem control acces bloc A",
    type: "VANZARI",
    stage: "NOU",
    ownerId,
    clientId: clientRef.id,
    number: ++nextNumber,
  })

  const opportunityB = await createOpportunity({
    title: "Upgrade videointerfon",
    type: "PROIECTE",
    stage: "OFERTA_TRIMISA",
    ownerId,
    clientId: clientRef.id,
    number: ++nextNumber,
  })

  const opportunityC = await createOpportunity({
    title: "Contract mentenanță 2026",
    type: "CONTRACTARE",
    stage: "NEGOCIERE",
    ownerId,
    clientId: clientRef.id,
    number: ++nextNumber,
  })

  await counterRef.set({ nextNumber }, { merge: true })

  for (const opportunity of [opportunityA, opportunityB, opportunityC]) {
    await db.collection("crm_opportunity_contacts").add({
      opportunityId: opportunity.id,
      contactId: contact1Ref.id,
      createdAt: FieldValue.serverTimestamp(),
    })
    await db.collection("crm_opportunity_contacts").add({
      opportunityId: opportunity.id,
      contactId: contact2Ref.id,
      createdAt: FieldValue.serverTimestamp(),
    })
  }

  console.log("CRM seed finalizat:", {
    clientId: clientRef.id,
    contactIds: [contact1Ref.id, contact2Ref.id],
    opportunities: [opportunityA.code, opportunityB.code, opportunityC.code],
  })
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
