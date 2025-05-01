"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Loader2 } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export function EmailDebugTool() {
  const [logs, setLogs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [testData, setTestData] = useState<string>(`{
  "workOrderId": "test-123",
  "client": {
    "name": "Test Client",
    "email": "test@example.com",
    "contactPerson": "Contact Person"
  },
  "technicians": [
    {
      "name": "Test Technician",
      "email": "technician@example.com"
    }
  ],
  "details": {
    "issueDate": "01.01.2023",
    "interventionDate": "02.01.2023",
    "workType": "Test Work Type",
    "location": "Test Location",
    "description": "Test Description",
    "reportedIssue": "Test Issue",
    "status": "Programat"
  }
}`)

  const addLog = (message: string) => {
    setLogs((prevLogs) => [...prevLogs, `[${new Date().toLocaleTimeString()}] ${message}`])
  }

  const handleTestEmail = async () => {
    setIsLoading(true)
    addLog("Starting email test...")

    try {
      // Parse the test data
      const parsedData = JSON.parse(testData)
      addLog(`Test data parsed successfully: ${JSON.stringify(parsedData, null, 2)}`)

      // Send the test data to the API
      addLog("Sending test data to notification API...")
      const response = await fetch("/api/notifications/work-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: testData,
      })

      // Log the response status
      addLog(`API response status: ${response.status}`)

      // Parse the response
      const result = await response.json()
      addLog(`API response: ${JSON.stringify(result, null, 2)}`)

      if (!response.ok) {
        toast({
          title: "Test failed",
          description: `Error: ${result.error || "Unknown error"}`,
          variant: "destructive",
        })
      } else {
        toast({
          title: "Test successful",
          description: "Email notification test completed successfully",
        })
      }
    } catch (error: any) {
      addLog(`Error: ${error.message}`)
      toast({
        title: "Test failed",
        description: `Error: ${error.message}`,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const clearLogs = () => {
    setLogs([])
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Email Notification Debug Tool</CardTitle>
        <CardDescription>Test email notifications and diagnose issues with the notification system</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="test">
          <TabsList className="mb-4">
            <TabsTrigger value="test">Test Email</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>

          <TabsContent value="test">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground mb-2">Enter test data in JSON format:</p>
                <Textarea
                  value={testData}
                  onChange={(e) => setTestData(e.target.value)}
                  className="font-mono text-sm h-[300px]"
                />
              </div>

              <div className="flex justify-end">
                <Button onClick={handleTestEmail} disabled={isLoading}>
                  {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Test Email Notification
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="logs">
            <div className="border rounded-md p-4 bg-muted/50 h-[400px] overflow-y-auto">
              <pre className="text-xs font-mono whitespace-pre-wrap">
                {logs.length > 0 ? logs.join("\n") : "No logs yet. Run a test to see logs."}
              </pre>
            </div>
            <div className="flex justify-end mt-4">
              <Button variant="outline" onClick={clearLogs}>
                Clear Logs
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="flex justify-between">
        <p className="text-xs text-muted-foreground">
          This tool helps diagnose issues with the email notification system.
        </p>
      </CardFooter>
    </Card>
  )
}
