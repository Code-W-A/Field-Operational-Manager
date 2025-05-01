"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Loader2, AlertCircle, CheckCircle } from "lucide-react"
import { verifyAndRepairAllClientsData } from "@/lib/utils/client-data-repair"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"

export function ClientDataRepairTool() {
  const [isRepairing, setIsRepairing] = useState(false)
  const [results, setResults] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleRepair = async () => {
    try {
      setIsRepairing(true)
      setError(null)

      const repairResults = await verifyAndRepairAllClientsData()
      setResults(repairResults)
    } catch (err) {
      console.error("Eroare la repararea datelor:", err)
      setError("A apărut o eroare la repararea datelor clienților")
    } finally {
      setIsRepairing(false)
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Instrument de verificare și reparare a datelor clienților</CardTitle>
        <CardDescription>
          Acest instrument verifică și repară structura datelor pentru toți clienții, asigurându-se că toate locațiile
          au array-uri corecte pentru echipamente și persoane de contact.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Eroare</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && (
          <div className="space-y-4">
            <Alert variant={results.success ? "default" : "destructive"}>
              {results.success ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              <AlertTitle>{results.success ? "Succes" : "Eroare"}</AlertTitle>
              <AlertDescription>{results.message}</AlertDescription>
            </Alert>

            {results.results && results.results.length > 0 && (
              <div className="border rounded-md">
                <div className="p-3 bg-muted font-medium">Rezultate pentru fiecare client</div>
                <ScrollArea className="h-[300px]">
                  <div className="p-4 space-y-3">
                    {results.results.map((result: any, index: number) => (
                      <div key={index} className="border rounded-md p-3">
                        <div className="flex justify-between items-center mb-2">
                          <h4 className="font-medium">{result.clientName}</h4>
                          <Badge variant={result.success ? "outline" : "destructive"}>
                            {result.success ? "Succes" : "Eroare"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{result.message}</p>

                        {result.details && result.details.length > 0 && (
                          <div className="mt-2 text-sm">
                            <p className="font-medium">Modificări:</p>
                            <ul className="list-disc pl-5 mt-1">
                              {result.details.map((detail: string, i: number) => (
                                <li key={i}>{detail}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleRepair} disabled={isRepairing}>
          {isRepairing ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Verificare și reparare în curs...
            </>
          ) : (
            "Verifică și repară datele clienților"
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
