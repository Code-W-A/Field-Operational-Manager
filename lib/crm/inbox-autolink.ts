export function extractOpportunityCodeFromSubject(subject: string) {
  const match = subject.match(/\bOP\.\s*0*(\d+)\b/i)
  if (!match) return undefined

  const numberValue = Number(match[1])
  if (!Number.isFinite(numberValue) || numberValue < 1) return undefined

  return `OP.${numberValue}`
}

export function shouldAutoLinkInboxMessage(params: {
  subject?: string | null
  opportunityId?: string | null
  crmEmailId?: string | null
}) {
  if (params.opportunityId || params.crmEmailId) {
    return false
  }

  return Boolean(extractOpportunityCodeFromSubject(String(params.subject || "")))
}
