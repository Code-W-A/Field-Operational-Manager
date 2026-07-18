export type FunctionsMailTransportEnvironment = {
  APP_DEPLOYMENT_ENV?: string
  MAIL_TRANSPORT_MODE?: string
}

export function mayUseExternalSmtp(env: FunctionsMailTransportEnvironment): boolean {
  return env.APP_DEPLOYMENT_ENV === "production" && env.MAIL_TRANSPORT_MODE === "smtp"
}
