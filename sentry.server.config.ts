import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const isProd = process.env.NODE_ENV === "production"

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn),
  tracesSampleRate: isProd ? 0.1 : 1,
  debug: false,
  beforeSend(event) {
    if (event.request?.url?.includes("/api/remote-signatures")) {
      event.request.data = undefined;
      event.request.headers = undefined;
      event.breadcrumbs = undefined;
      event.extra = undefined;
    }
    return event;
  },
})
