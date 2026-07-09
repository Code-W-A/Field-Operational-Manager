import { FieldValue, type DocumentData } from "firebase-admin/firestore"
import { NextResponse, type NextRequest } from "next/server"

import { RequireRoleError, requireRole } from "@/lib/auth/require-role"
import { adminAuth, adminDb } from "@/lib/firebase/admin"

type PostBody = {
  allowMutating?: boolean
  runPrefix?: string
  techEmail?: string
}

function sanitizeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 48)
}

function isE2EPrefix(value: string) {
  return value.startsWith("E2E_RUN_") || value.startsWith("E2E_")
}

function getEmployeeDisplayName(data: DocumentData) {
  const fullName = String(data.fullName || "").trim()
  if (fullName) return fullName
  return `${String(data.prenume || "").trim()} ${String(data.nume || "").trim()}`.trim()
}

function isE2EEmployee(data: DocumentData) {
  const values = [
    data.fullName,
    data.nume,
    data.prenume,
    data.title,
    data.loculDeMunca,
  ].map((v) => String(v || ""))
  return values.some((v) => v.includes("E2E_RUN_") || v.includes("E2E_"))
}

async function resolveUserByEmail(email: string) {
  const usersByEmail = await adminDb.collection("users").where("email", "==", email).limit(1).get()
  if (!usersByEmail.empty) {
    const doc = usersByEmail.docs[0]
    return { uid: doc.id, data: doc.data() }
  }

  const authUser = await adminAuth.getUserByEmail(email)
  const data = {
    uid: authUser.uid,
    email: authUser.email || email,
    displayName: authUser.displayName || email,
    role: "tehnician",
    createdAt: FieldValue.serverTimestamp(),
    lastLogin: FieldValue.serverTimestamp(),
  }
  await adminDb.collection("users").doc(authUser.uid).set(data, { merge: true })
  return { uid: authUser.uid, data }
}

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(["admin"], request)
    if (!session.uid) {
      return NextResponse.json({ error: "Autentificare admin obligatorie." }, { status: 401 })
    }

    const body = (await request.json()) as PostBody
    const allowMutating = body.allowMutating === true
    const runPrefix = String(body.runPrefix || "").trim()
    const techEmail = String(body.techEmail || "").trim().toLowerCase()

    if (!allowMutating) {
      return NextResponse.json({ error: "Bootstrap-ul E2E necesita allowMutating=true." }, { status: 400 })
    }
    if (!runPrefix || !isE2EPrefix(runPrefix)) {
      return NextResponse.json({ error: "runPrefix trebuie sa inceapa cu E2E_RUN_ sau E2E_." }, { status: 400 })
    }
    if (!techEmail || !techEmail.includes("@")) {
      return NextResponse.json({ error: "techEmail invalid." }, { status: 400 })
    }

    const techUser = await resolveUserByEmail(techEmail)
    const role = String(techUser.data.role || "")
    if (role !== "tehnician") {
      return NextResponse.json(
        { error: `Utilizatorul ${techEmail} trebuie sa aiba rol tehnician pentru fixture-ul de pontaj.` },
        { status: 400 }
      )
    }

    const linkedEmployees = await adminDb
      .collection("hrEmployees")
      .where("userUid", "==", techUser.uid)
      .limit(10)
      .get()

    const existingEmployees = linkedEmployees.docs.map((doc) => ({ id: doc.id, data: doc.data() }))
    const activeExisting = existingEmployees.find((employee) => employee.data.active === true)
    const e2eExisting = existingEmployees.find((employee) => isE2EEmployee(employee.data))

    if (e2eExisting) {
      const currentSectorIds = Array.isArray(e2eExisting.data.sectorIds)
        ? e2eExisting.data.sectorIds.map((value) => String(value || "").trim()).filter(Boolean)
        : []
      const departmentId = currentSectorIds[0] || `dept_e2e_attendance_${sanitizeIdPart(techUser.uid)}`

      await adminDb.collection("hrDepartments").doc(departmentId).set(
        {
          name: `${runPrefix} Departament Pontaj`,
          description: "Fixture E2E pentru teste Playwright pontaj/kiosk/field.",
          managerUid: session.uid,
          active: true,
          createdBy: session.uid,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      await adminDb.collection("hrEmployees").doc(e2eExisting.id).set(
        {
          active: true,
          userUid: techUser.uid,
          sectorIds: [departmentId],
          managerUidBySector: { [departmentId]: session.uid },
          superiorUid: session.uid,
          programLucruStart: e2eExisting.data.programLucruStart || "08:00",
          programLucruEnd: e2eExisting.data.programLucruEnd || "16:30",
          pauzaStart: e2eExisting.data.pauzaStart || "12:00",
          pauzaEnd: e2eExisting.data.pauzaEnd || "12:30",
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      )

      return NextResponse.json({
        ok: true,
        fixture: {
          source: "existing-e2e-employee",
          employeeId: e2eExisting.id,
          employeeName: getEmployeeDisplayName(e2eExisting.data),
          userUid: techUser.uid,
          departmentId,
        },
      })
    }

    if (activeExisting) {
      return NextResponse.json({
        ok: true,
        fixture: {
          source: "existing-linked-employee",
          employeeId: activeExisting.id,
          employeeName: getEmployeeDisplayName(activeExisting.data),
          userUid: techUser.uid,
          departmentId: Array.isArray(activeExisting.data.sectorIds) ? activeExisting.data.sectorIds[0] || null : null,
        },
      })
    }

    const uidPart = sanitizeIdPart(techUser.uid)
    const departmentId = `dept_e2e_attendance_${uidPart}`
    const employeeId = `emp_e2e_attendance_${uidPart}`
    const employeeLastName = `${runPrefix}_Pontaj`
    const employeeFirstName = "Tehnician"
    const employeeName = `${employeeFirstName} ${employeeLastName}`

    await adminDb.collection("hrDepartments").doc(departmentId).set(
      {
        name: `${runPrefix} Departament Pontaj`,
        description: "Fixture E2E pentru teste Playwright pontaj/kiosk/field.",
        managerUid: session.uid,
        active: true,
        createdBy: session.uid,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    await adminDb.collection("hrEmployees").doc(employeeId).set(
      {
        nume: employeeLastName,
        prenume: employeeFirstName,
        fullName: employeeName,
        title: "E2E Tehnician Pontaj",
        poziteCOR: "E2E",
        superiorUid: session.uid,
        superiorIerarhic: null,
        sectorIds: [departmentId],
        managerUidBySector: { [departmentId]: session.uid },
        loculDeMunca: "E2E",
        programLucruStart: "08:00",
        programLucruEnd: "16:30",
        pauzaStart: "12:00",
        pauzaEnd: "12:30",
        zileConcediuAnuale: 21,
        active: true,
        userUid: techUser.uid,
        photoURL: null,
        photoUpdatedAt: null,
        cnp: null,
        ciSerie: null,
        ciNumar: null,
        ciDataEmiterii: null,
        ciEmitent: null,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    )

    return NextResponse.json({
      ok: true,
      fixture: {
        source: "created-e2e-employee",
        employeeId,
        employeeName,
        userUid: techUser.uid,
        departmentId,
      },
    })
  } catch (error: unknown) {
    if (error instanceof RequireRoleError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error("[E2E attendance fixture] Bootstrap failed:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Bootstrap fixture E2E esuat." },
      { status: 500 }
    )
  }
}
