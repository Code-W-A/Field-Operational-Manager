"use client"

import { Component, type ErrorInfo, type ReactNode } from "react"
import * as Sentry from "@sentry/nextjs"
import { Button } from "@/components/ui/button"

type Props = {
  children: ReactNode
  /** Titlu scurt afișat utilizatorului */
  fallbackTitle?: string
}

type State = { hasError: boolean }

export class SentryErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    Sentry.captureException(error, {
      contexts: { react: { componentStack: errorInfo.componentStack } },
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-8 text-center">
          <h2 className="text-lg font-semibold">
            {this.props.fallbackTitle ?? "A apărut o eroare"}
          </h2>
          <p className="max-w-md text-sm text-muted-foreground">
            Eroarea a fost trimisă automat. Poți reîncărca pagina.
          </p>
          <Button
            type="button"
            onClick={() => {
              this.setState({ hasError: false })
              window.location.reload()
            }}
          >
            Reîncarcă
          </Button>
        </div>
      )
    }
    return this.props.children
  }
}
