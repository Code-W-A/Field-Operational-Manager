export type MailTransportMode = "disabled" | "sink" | "smtp"

export type MailTransportPolicy = {
  mode: MailTransportMode
  deploymentEnvironment: string
  sinkAllowedDomains: string[]
  reason?: string
}

const PRODUCTION_PROJECT_ID = "field-operational-manager"

function splitDomains(value: string | undefined): string[] {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
}

function disabled(deploymentEnvironment: string, reason: string): MailTransportPolicy {
  return { mode: "disabled", deploymentEnvironment, sinkAllowedDomains: [], reason }
}

export function resolveMailTransportPolicy(
  env: Record<string, string | undefined> = process.env,
): MailTransportPolicy {
  const deploymentEnvironment = String(env.APP_DEPLOYMENT_ENV || "unknown").trim().toLowerCase()
  const rawMode = String(env.MAIL_TRANSPORT_MODE || "").trim().toLowerCase()
  const sinkAllowedDomains = splitDomains(env.MAIL_SINK_ALLOWED_DOMAINS)

  if (rawMode !== "disabled" && rawMode !== "sink" && rawMode !== "smtp") {
    return disabled(deploymentEnvironment, "MAIL_TRANSPORT_MODE lipsește sau este invalid")
  }

  if (deploymentEnvironment === "staging" && rawMode === "smtp") {
    return disabled(deploymentEnvironment, "SMTP este interzis în staging")
  }

  if (rawMode === "sink") {
    if (sinkAllowedDomains.length === 0) {
      return disabled(deploymentEnvironment, "MAIL_SINK_ALLOWED_DOMAINS lipsește")
    }
    return { mode: "sink", deploymentEnvironment, sinkAllowedDomains }
  }

  if (rawMode === "smtp") {
    if (deploymentEnvironment !== "production") {
      return disabled(deploymentEnvironment, "SMTP este permis numai în production")
    }
    if (env.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== PRODUCTION_PROJECT_ID) {
      return disabled(deploymentEnvironment, "SMTP production necesită proiectul Firebase production")
    }
    const required = ["EMAIL_SMTP_HOST", "EMAIL_SMTP_PORT", "EMAIL_USER", "EMAIL_PASSWORD"]
    if (required.some((key) => !String(env[key] || "").trim())) {
      return disabled(deploymentEnvironment, "Configurația SMTP este incompletă")
    }
  }

  return { mode: rawMode, deploymentEnvironment, sinkAllowedDomains }
}

export function areSinkRecipientsAllowed(recipients: string[], allowedDomains: string[]): boolean {
  if (allowedDomains.length === 0) return false
  return recipients.every((recipient) => {
    const normalized = recipient.trim().toLowerCase()
    const at = normalized.lastIndexOf("@")
    if (at <= 0) return false
    const domain = normalized.slice(at + 1)
    return allowedDomains.some((allowedDomain) =>
      allowedDomain.startsWith(".") ? domain.endsWith(allowedDomain) : domain === allowedDomain
    )
  })
}
