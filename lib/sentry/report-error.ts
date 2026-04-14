import * as Sentry from "@sentry/nextjs"

type ReportContext = {
  tags?: Record<string, string>
  extra?: Record<string, unknown>
}

/**
 * Raportează explicit la Sentry (ex. în catch-uri unde nu re-arunci eroarea).
 */
export function reportToSentry(error: unknown, context?: ReportContext): void {
  Sentry.captureException(error, {
    tags: context?.tags,
    extra: context?.extra,
  })
}

export function reportMessageToSentry(
  message: string,
  level: "fatal" | "error" | "warning" | "info" | "debug" = "warning",
  context?: ReportContext,
): void {
  Sentry.captureMessage(message, {
    level,
    tags: context?.tags,
    extra: context?.extra,
  })
}
