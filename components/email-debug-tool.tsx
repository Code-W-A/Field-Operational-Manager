"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Spinner } from "@/components/ui/spinner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, Info } from "lucide-react"

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
  const [smtpConfig, setSmtpConfig] = useState({
    host: "",
    port: "465",
    secure: true,
    user: "",
    password: "",
  })
  const [simpleTestConfig, setSimpleTestConfig] = useState({
    recipient: "",
    subject: "Test Email",
    message: "Acesta este un email de test trimis din aplicația Field Operational Manager.",
  })
  const [testResult, setTestResult] = useState<{
    success?: boolean
    message?: string
    error?: string
  } | null>(null)

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString()
    setLogs((prevLogs) => [...prevLogs, `[${timestamp}] ${message}`])
  }

  const handleTestEmail = async () => {
    setIsLoading(true)
    setLogs([])
    setTestResult(null)
    addLog("Starting email test...")

    try {
      // Parse the test data
      let parsedData
      try {
        parsedData = JSON.parse(testData)
        addLog(`Test data parsed successfully: ${JSON.stringify(parsedData, null, 2)}`)
      } catch (error: any) {
        addLog(`Error parsing test data: ${error.message}`)
        setTestResult({
          success: false,
          error: `Eroare la parsarea datelor JSON: ${error.message}`,
        })
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
        setTestResult({
          success: true,
          message: "Testul de email a fost finalizat cu succes!",
        })
        setActiveTab("logs")
      } else {
        addLog(`Email test failed: ${result.error || "Unknown error"}`)
        setTestResult({
          success: false,
          error: result.error || "Eroare necunoscută",
        })
        setActiveTab("logs")
      }
    } catch (error: any) {
      addLog(`Unexpected error: ${error.message}`)
      setTestResult({
        success: false,
        error: `Eroare neașteptată: ${error.message}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleTestSmtpConnection = async () => {
    setIsLoading(true)
    setTestResult(null)
    addLog("Testing SMTP connection...")

    try {
      const response = await fetch("/api/email/test-smtp", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          host: smtpConfig.host || undefined,
          port: smtpConfig.port ? Number.parseInt(smtpConfig.port) : undefined,
          secure: smtpConfig.secure,
          user: smtpConfig.user || undefined,
          password: smtpConfig.password || undefined,
        }),
      })

      const result = await response.json()

      if (response.ok) {
        addLog(`SMTP connection successful: ${result.message}`)
        setTestResult({
          success: true,
          message: result.message || "Conexiunea SMTP a fost testată cu succes",
        })
      } else {
        addLog(`SMTP connection failed: ${result.error}`)
        setTestResult({
          success: false,
          error: result.error || "Eroare la testarea conexiunii SMTP",
        })
      }
    } catch (error: any) {
      addLog(`Error testing SMTP connection: ${error.message}`)
      setTestResult({
        success: false,
        error: `Eroare la testarea conexiunii SMTP: ${error.message}`,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSendSimpleTest = async () => {
    setIsLoading(true)
    setTestResult(null)
    addLog(`Sending simple test email to ${simpleTestConfig.recipient}...`)

    try {
      const response = await fetch("/api/email/send-test", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(simpleTestConfig),
      })

      const result = await response.json()

      if (response.ok) {
        addLog(`Simple test email sent successfully: ${result.message}`)
        setTestResult({
          success: true,
          message: result.message || "Email-ul de test a fost trimis cu succes",
        })
      } else {
        addLog(`Failed to send simple test email: ${result.error}`)
        setTestResult({
          success: false,
          error: result.error || "Eroare la trimiterea email-ului de test",
        })
      }
    } catch (error: any) {
      addLog(`Error sending simple test email: ${error.message}`)
      setTestResult({
        success: false,
        error: `Eroare la trimiterea email-ului de test: ${error.message}`,
      })
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
              <TabsTrigger value="simple-test">Test Simplu</TabsTrigger>
              <TabsTrigger value="test-data">Test Complet</TabsTrigger>
              <TabsTrigger value="smtp-config">Configurare SMTP</TabsTrigger>
              <TabsTrigger value="logs">Loguri {logs.length > 0 && `(${logs.length})`}</TabsTrigger>
            </TabsList>

            <TabsContent value="simple-test">
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-4">
                  <div className="flex">
                    <Info className="h-5 w-5 text-blue-500 mr-2" />
                    <h3 className="text-blue-800 font-medium">Test simplu de email</h3>
                  </div>
                  <p className="text-blue-700 text-sm mt-1">
                    Acest test trimite un email simplu către adresa specificată, folosind configurația SMTP curentă.
                    Este util pentru a verifica rapid dacă sistemul de email funcționează corect.
                  </p>
                </div>

                {testResult && (
                  <Alert
                    variant={testResult.success ? "default" : "destructive"}
                    className={testResult.success ? "bg-green-50 border-green-200" : undefined}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{testResult.success ? "Succes" : "Eroare"}</AlertTitle>
                    <AlertDescription>{testResult.success ? testResult.message : testResult.error}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="recipient">Adresa de email a destinatarului</Label>
                    <Input
                      id="recipient"
                      placeholder="destinatar@example.com"
                      value={simpleTestConfig.recipient}
                      onChange={(e) => setSimpleTestConfig({ ...simpleTestConfig, recipient: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="subject">Subiect</Label>
                    <Input
                      id="subject"
                      placeholder="Test Email"
                      value={simpleTestConfig.subject}
                      onChange={(e) => setSimpleTestConfig({ ...simpleTestConfig, subject: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="message">Mesaj</Label>
                    <Textarea
                      id="message"
                      placeholder="Acesta este un email de test."
                      value={simpleTestConfig.message}
                      onChange={(e) => setSimpleTestConfig({ ...simpleTestConfig, message: e.target.value })}
                      className="h-[150px]"
                    />
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleSendSimpleTest} disabled={isLoading || !simpleTestConfig.recipient}>
                      {isLoading ? (
                        <>
                          <Spinner className="mr-2" /> Se trimite...
                        </>
                      ) : (
                        "Trimite email de test"
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="test-data">
              <div className="space-y-4">
                {testResult && (
                  <Alert
                    variant={testResult.success ? "default" : "destructive"}
                    className={testResult.success ? "bg-green-50 border-green-200" : undefined}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{testResult.success ? "Succes" : "Eroare"}</AlertTitle>
                    <AlertDescription>{testResult.success ? testResult.message : testResult.error}</AlertDescription>
                  </Alert>
                )}

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

            <TabsContent value="smtp-config">
              <div className="space-y-6">
                <div className="bg-amber-50 border border-amber-200 rounded-md p-4 mb-4">
                  <h3 className="text-amber-800 font-medium mb-2">Notă importantă</h3>
                  <p className="text-amber-700 text-sm">
                    Această configurare este temporară și nu va modifica configurația serverului. Pentru a schimba
                    permanent configurația SMTP, actualizați variabilele de mediu.
                  </p>
                </div>

                {testResult && (
                  <Alert
                    variant={testResult.success ? "default" : "destructive"}
                    className={testResult.success ? "bg-green-50 border-green-200" : undefined}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <AlertCircle className="h-4 w-4" />
                    )}
                    <AlertTitle>{testResult.success ? "Succes" : "Eroare"}</AlertTitle>
                    <AlertDescription>{testResult.success ? testResult.message : testResult.error}</AlertDescription>
                  </Alert>
                )}

                <div className="grid gap-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="smtp-host">Server SMTP</Label>
                      <Input
                        id="smtp-host"
                        placeholder="mail.example.com"
                        value={smtpConfig.host}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, host: e.target.value })}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="smtp-port">Port</Label>
                      <Input
                        id="smtp-port"
                        placeholder="465"
                        value={smtpConfig.port}
                        onChange={(e) => setSmtpConfig({ ...smtpConfig, port: e.target.value })}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-user">Utilizator</Label>
                    <Input
                      id="smtp-user"
                      placeholder="user@example.com"
                      value={smtpConfig.user}
                      onChange={(e) => setSmtpConfig({ ...smtpConfig, user: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="smtp-password">Parolă</Label>
                    <Input
                      id="smtp-password"
                      type="password"
                      placeholder="••••••••"
                      value={smtpConfig.password}
                      onChange={(e) => setSmtpConfig({ ...smtpConfig, password: e.target.value })}
                    />
                  </div>

                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="smtp-secure"
                      checked={smtpConfig.secure}
                      onChange={(e) => setSmtpConfig({ ...smtpConfig, secure: e.target.checked })}
                      className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <Label htmlFor="smtp-secure">Conexiune securizată (SSL/TLS)</Label>
                  </div>
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={handleTestSmtpConnection}
                    disabled={isLoading || !smtpConfig.host || !smtpConfig.user || !smtpConfig.password}
                  >
                    {isLoading ? (
                      <>
                        <Spinner className="mr-2" /> Se testează...
                      </>
                    ) : (
                      "Testează conexiunea SMTP"
                    )}
                  </Button>
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
          {activeTab === "test-data" && (
            <Button onClick={handleTestEmail} disabled={isLoading}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2" /> Se procesează...
                </>
              ) : (
                "Testează Email"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>

      <Accordion type="single" collapsible className="mt-6">
        <AccordionItem value="troubleshooting">
          <AccordionTrigger>Ghid de depanare</AccordionTrigger>
          <AccordionContent>
            <div className="space-y-4 text-sm">
              <h3 className="font-medium">Probleme comune și soluții</h3>

              <div className="space-y-2">
                <h4 className="font-medium">Eroare de autentificare (535 Incorrect authentication data)</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Verificați dacă numele de utilizator și parola sunt corecte</li>
                  <li>Asigurați-vă că contul de email nu are autentificare în doi pași activată</li>
                  <li>Unele servicii necesită o parolă de aplicație specială</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Eroare de conexiune</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Verificați dacă serverul SMTP și portul sunt corecte</li>
                  <li>Asigurați-vă că setarea SSL/TLS este corectă pentru serverul dvs.</li>
                  <li>Verificați dacă firewall-ul sau rețeaua nu blochează conexiunea</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Email-urile nu ajung la destinație</h4>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Verificați folderul de spam al destinatarului</li>
                  <li>Asigurați-vă că adresele de email sunt corecte</li>
                  <li>Verificați dacă serverul SMTP are limite de trimitere</li>
                </ul>
              </div>

              <div className="space-y-2">
                <h4 className="font-medium">Configurații SMTP comune</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Serviciu
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Server SMTP
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Port
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Secure
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap">Gmail</td>
                        <td className="px-6 py-4 whitespace-nowrap">smtp.gmail.com</td>
                        <td className="px-6 py-4 whitespace-nowrap">465</td>
                        <td className="px-6 py-4 whitespace-nowrap">Da</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap">Outlook/Office 365</td>
                        <td className="px-6 py-4 whitespace-nowrap">smtp.office365.com</td>
                        <td className="px-6 py-4 whitespace-nowrap">587</td>
                        <td className="px-6 py-4 whitespace-nowrap">Nu (STARTTLS)</td>
                      </tr>
                      <tr>
                        <td className="px-6 py-4 whitespace-nowrap">Yahoo</td>
                        <td className="px-6 py-4 whitespace-nowrap">smtp.mail.yahoo.com</td>
                        <td className="px-6 py-4 whitespace-nowrap">465</td>
                        <td className="px-6 py-4 whitespace-nowrap">Da</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
