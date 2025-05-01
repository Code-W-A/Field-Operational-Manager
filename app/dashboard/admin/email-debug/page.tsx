import { EmailDebugTool } from "@/components/email-debug-tool"

export default function EmailDebugPage() {
  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Email Notification Debugging</h1>
      <EmailDebugTool />
    </div>
  )
}
