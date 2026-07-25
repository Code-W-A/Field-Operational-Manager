import test from "node:test"
import assert from "node:assert/strict"

import { buildKioskEligibleUsers } from "./kiosk-eligible-users"
import type { Employee } from "@/lib/hr/types"

type UserInput = {
  uid: string
  role?: string
  email?: string
  displayName?: string
  kioskPin?: string
}

function employee(input: Partial<Employee> & Pick<Employee, "id" | "nume" | "prenume">): Employee {
  return {
    id: input.id,
    nume: input.nume,
    prenume: input.prenume,
    active: input.active ?? true,
    userUid: input.userUid,
    photoURL: input.photoURL,
    fullName: input.fullName,
  }
}

test("includes tehnician/admin/dispecer with active HR mapping and email", () => {
  const employees = [
    employee({ id: "e1", nume: "Popescu", prenume: "Ana", userUid: "u-tech" }),
    employee({ id: "e2", nume: "Ionescu", prenume: "Dan", userUid: "u-admin" }),
    employee({ id: "e3", nume: "Marin", prenume: "Ema", userUid: "u-disp" }),
  ]

  const users: UserInput[] = [
    { uid: "u-tech", role: "tehnician", email: "tech@company.ro" },
    { uid: "u-admin", role: "admin", email: "admin@company.ro" },
    { uid: "u-disp", role: "dispecer", email: "disp@company.ro" },
  ]

  const result = buildKioskEligibleUsers({ employees, users })

  assert.equal(result.length, 3)
  assert.equal(result.some((u) => u.uid === "u-tech" && u.role === "tehnician"), true)
  assert.equal(result.some((u) => u.uid === "u-admin" && u.role === "admin"), true)
  assert.equal(result.some((u) => u.uid === "u-disp" && u.role === "dispecer"), true)
})

test("excludes kiosk/client roles even if mapped to active HR employees", () => {
  const employees = [
    employee({ id: "e1", nume: "Client", prenume: "One", userUid: "u-client" }),
    employee({ id: "e2", nume: "Kiosk", prenume: "One", userUid: "u-kiosk" }),
  ]
  const users: UserInput[] = [
    { uid: "u-client", role: "client", email: "client@company.ro" },
    { uid: "u-kiosk", role: "kiosk", email: "kiosk@company.ro" },
  ]

  const result = buildKioskEligibleUsers({ employees, users })
  assert.deepEqual(result, [])
})

test("excludes users without email or without active HR mapping", () => {
  const employees = [
    employee({ id: "e1", nume: "Active", prenume: "NoMail", userUid: "u-no-mail" }),
    employee({ id: "e2", nume: "Inactive", prenume: "Tech", userUid: "u-inactive", active: false }),
    employee({ id: "e3", nume: "No", prenume: "UserUid" }),
  ]
  const users: UserInput[] = [
    { uid: "u-no-mail", role: "tehnician", email: "" },
    { uid: "u-inactive", role: "tehnician", email: "inactive@company.ro" },
  ]

  const result = buildKioskEligibleUsers({ employees, users })
  assert.deepEqual(result, [])
})

test("deduplicates by uid and keeps stable sorted output", () => {
  const employees = [
    employee({ id: "e2", nume: "Zeta", prenume: "Mihai", userUid: "u-1", photoURL: undefined }),
    employee({ id: "e1", nume: "Alpha", prenume: "Mihai", userUid: "u-1", photoURL: "https://img.test/mihai.jpg" }),
    employee({ id: "e3", nume: "Beta", prenume: "Ana", userUid: "u-2" }),
  ]
  const users: UserInput[] = [
    { uid: "u-1", role: "admin", email: "m@company.ro" },
    { uid: "u-2", role: "dispecer", email: "a@company.ro" },
  ]

  const result = buildKioskEligibleUsers({ employees, users })

  assert.equal(result.length, 2)
  assert.deepEqual(result.map((u) => u.displayName), ["Ana Beta", "Mihai Alpha"])
  const mihai = result.find((u) => u.uid === "u-1")
  assert.equal(mihai?.photoURL, "https://img.test/mihai.jpg")
})

test("propagates kioskPin from source user when present", () => {
  const employees = [employee({ id: "e1", nume: "Popescu", prenume: "Ana", userUid: "u-tech" })]
  const users: UserInput[] = [
    { uid: "u-tech", role: "tehnician", email: "tech@company.ro", kioskPin: "4321" },
  ]

  const result = buildKioskEligibleUsers({ employees, users })
  assert.equal(result.length, 1)
  assert.equal(result[0]?.kioskPin, "4321")
})
