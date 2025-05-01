import EmailDebugTool from "@/components/email-debug-tool"

export default function EmailDebugPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Diagnosticare Email</h2>
        <p className="text-muted-foreground">
          Folosește acest instrument pentru a diagnostica problemele cu trimiterea email-urilor.
        </p>
      </div>
      <EmailDebugTool />
    </div>
  )
}
