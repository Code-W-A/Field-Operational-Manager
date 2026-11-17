import * as Sentry from "@sentry/nextjs"

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN
const isProd = process.env.NODE_ENV === "production"

Sentry.init({
  dsn: dsn || undefined,
  enabled: Boolean(dsn) && !window.location.pathname.startsWith("/semneaza"),
  beforeSend(event) {
    if (window.location.pathname.startsWith("/semneaza")) return null;
    return event;
  },
  beforeBreadcrumb(breadcrumb) {
    if (window.location.pathname.startsWith("/semneaza")) return null;
    return breadcrumb;
  },
  tracesSampleRate: isProd ? 0.1 : 1,
  debug: false,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
