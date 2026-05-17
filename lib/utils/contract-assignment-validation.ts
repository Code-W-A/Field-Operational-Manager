export type ContractDuplicateDecisionInput = {
  contractNumber: string
  clientId: string
  excludeContractId?: string
  existingContract?: {
    id?: string
    clientId?: string | null
  } | null
  assignedClientName?: string
}

export function resolveDuplicateContractAssignmentConflict(
  input: ContractDuplicateDecisionInput,
): { isValid: boolean; error?: string } {
  const contractNumber = String(input.contractNumber || "")
  const clientId = String(input.clientId || "")
  const excludeContractId = String(input.excludeContractId || "")
  const existingContractId = String(input.existingContract?.id || "")
  const existingClientId = String(input.existingContract?.clientId || "")

  if (!input.existingContract) {
    return { isValid: true }
  }

  // Defensive guard: if the duplicate candidate is the excluded contract, it must never block.
  if (excludeContractId && existingContractId && existingContractId === excludeContractId) {
    return { isValid: true }
  }

  if (existingClientId && existingClientId !== clientId) {
    const clientName = String(input.assignedClientName || "").trim() || "client necunoscut"
    return {
      isValid: false,
      error: `Contractul "${contractNumber}" este deja asignat clientului: ${clientName}`,
    }
  }

  if (!existingClientId && clientId) {
    return {
      isValid: false,
      error: `Există deja un contract cu numărul "${contractNumber}" care nu este asignat. Asignați acel contract în loc să creați unul nou.`,
    }
  }

  return { isValid: true }
}
