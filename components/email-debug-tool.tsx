"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/components/ui/spinner"

export default function EmailDebugTool() {
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
  const [logs, setLogs] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [activeTab, setActiveTab] = useState<string>("test-data")

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prevLogs) => [...prevLogs, `[${timestamp}] ${message}`])
  }

  const handleTestEmail = async () => {
    setIsLoading(true)
    setLogs([])
    addLog("Starting email test...")

    try {
      // Parse the test data
      let parsedData
      try {
        parsedData = JSON.parse(testData)
        addLog(`Test data parsed successfully: ${JSON.stringify(parsedData, null, 2)}`)
      } catch (error: any) {
        addLog(`Error parsing test data: ${error.message}`)
        setIsLoading(false)
        return
      }

      // Send the test data to the notification API
      addLog("Sending test data to notification API...")
      const response = await fetch("/api/notifications/work-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: testData,
      })

      addLog(`API response status: ${response.status}`)
      const result = await response.json()
      addLog(`API response: ${JSON.stringify(result, null, 2)}`)

      if (response.ok) {
        addLog("Email test completed successfully!")
        setActiveTab("logs")
      } else {
        addLog(`Email test failed: ${result.error || "Unknown error"}`)
        setActiveTab("logs")
      }
    } catch (error: any) {
      addLog(`Unexpected error: ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }

  const handleClearLogs = () => {
    setLogs([])
  }

  return (
    <div className="container mx-auto py-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Email Notification Debug Tool</CardTitle>
          <CardDescription>
            Testează funcționalitatea de trimitere a email-urilor pentru notificări de lucrări
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="test-data">Date Test</TabsTrigger>
              <TabsTrigger value="logs">Loguri {logs.length > 0 && `(${logs.length})`}</TabsTrigger>
            </TabsList>

            <TabsContent value="test-data">
              <div className="space-y-4">
                <div>
                  <label htmlFor="test-data" className="block text-sm font-medium mb-2">
                    Date pentru testare (JSON)
                  </label>
                  <Textarea
                    id="test-data"
                    value={testData}
                    onChange={(e) => setTestData(e.target.value)}
                    className="h-[400px] font-mono text-sm"
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="logs">
              <div className="space-y-4">
                <ScrollArea className="h-[400px] w-full border rounded-md p-4 bg-black text-white font-mono text-sm">
                  {logs.length === 0 ? (
                    <div className="text-gray-400 italic">
                      Nu există loguri. Apasă butonul "Testează Email" pentru a începe.
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log, index) => (
                        <div key={index} className="whitespace-pre-wrap">
                          {log}
                        </div>
                      ))}
                    </div>
                  )}
                </ScrollArea>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={handleClearLogs} disabled={logs.length === 0}>
                    Șterge Loguri
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            Notă: Verifică și consola browserului pentru loguri suplimentare.
          </div>
          <Button onClick={handleTestEmail} disabled={isLoading}>
            {isLoading ? (
              <>
                <Spinner className="mr-2" /> Se procesează...
              </>
            ) : (
              "Testează Email"
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
