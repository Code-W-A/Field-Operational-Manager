"use client"

export default function SentryExamplePage() {
  return (
    <div className="p-8">
      <h1 className="text-xl font-semibold mb-4">Test Sentry</h1>
      <p className="mb-4 text-muted-foreground">
        Apasă butonul pentru a trimite o eroare de probă către Sentry (doar dacă
        NEXT_PUBLIC_SENTRY_DSN este setat).
      </p>
      <button
        type="button"
        className="rounded-md bg-destructive px-4 py-2 text-destructive-foreground"
        onClick={() => {
          throw new Error("Sentry test error (FOM Next.js)")
        }}
      >
        Declanșează eroare
      </button>
    </div>
  )
}
