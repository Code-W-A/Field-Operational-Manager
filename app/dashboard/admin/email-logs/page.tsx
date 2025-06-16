import { EmailLogViewer } from "@/components/email-log-viewer"

export default function EmailLogsPage() {
  return (
    <div className="w-full mx-auto py-6 space-y-6">
      <h1 className="text-3xl font-bold">Loguri Email</h1>
      <p className="text-muted-foreground">
        Vizualizați și analizați logurile detaliate pentru diagnosticarea problemelor de email.
      </p>

      <EmailLogViewer />
    </div>
  )
}
