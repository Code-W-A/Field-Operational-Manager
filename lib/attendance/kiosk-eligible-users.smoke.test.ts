import test from "node:test"
import assert from "node:assert/strict"

import { buildKioskEligibleUsers } from "./kiosk-eligible-users"
import type { Employee } from "@/lib/hr/types"

type UserInput = {
  uid: string
  role?: string
  email?: string
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

test("smoke: kiosk roster contains only eligible mapped users in sorted order", () => {
  const employees: Employee[] = [
    employee({ id: "emp-1", nume: "Pop", prenume: "Ioana", userUid: "uid-tech", active: true }),
    employee({ id: "emp-2", nume: "Vlad", prenume: "Radu", userUid: "uid-admin", active: true }),
    employee({ id: "emp-3", nume: "Marin", prenume: "Elena", userUid: "uid-disp", active: true }),
    employee({ id: "emp-4", nume: "Client", prenume: "Test", userUid: "uid-client", active: true }),
    employee({ id: "emp-5", nume: "Missing", prenume: "Email", userUid: "uid-no-email", active: true }),
  ]

  const users: UserInput[] = [
    { uid: "uid-tech", role: "tehnician", email: "tech@company.ro" },
    { uid: "uid-admin", role: "admin", email: "admin@company.ro" },
    { uid: "uid-disp", role: "dispecer", email: "disp@company.ro" },
    { uid: "uid-client", role: "client", email: "client@company.ro" },
    { uid: "uid-no-email", role: "admin", email: "" },
  ]

  const roster = buildKioskEligibleUsers({ employees, users })

  assert.deepEqual(
    roster.map((u) => ({ uid: u.uid, role: u.role, name: u.displayName })),
    [
      { uid: "uid-disp", role: "dispecer", name: "Elena Marin" },
      { uid: "uid-tech", role: "tehnician", name: "Ioana Pop" },
      { uid: "uid-admin", role: "admin", name: "Radu Vlad" },
    ],
  )
})
