export type ContractStatus = "active" | "suspended"

export const SUSPENDED_CONTRACT_MESSAGE =
  "Contractul este suspendat. Nu se pot emite tichete noi asociate acestui contract."

export function normalizeContractStatus(status: unknown): ContractStatus {
  return String(status || "").trim().toLowerCase() === "suspended" ? "suspended" : "active"
}

export function isContractSuspended(contract: { status?: unknown } | null | undefined): boolean {
  return normalizeContractStatus(contract?.status) === "suspended"
}

export function canCreateContractWork(contract: { status?: unknown } | null | undefined): boolean {
  return !isContractSuspended(contract)
}
