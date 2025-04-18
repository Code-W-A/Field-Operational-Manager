"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Check, Download, Send, ArrowLeft } from "lucide-react"
import SignatureCanvas from "react-signature-canvas"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function RaportPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [signatureRef, setSignatureRef] = useState<SignatureCanvas | null>(null)
  const [isSigned, setIsSigned] = useState(false)
  const [isSubmitted, setIsSubmitted] = useState(false)

  const [lucrare, setLucrare] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState<"verificare" | "semnare" | "finalizat">("verificare")
  const [statusLucrare, setStatusLucrare] = useState<string>("")

  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        setLoading(true)
        const data = await getLucrareById(params.id)
        if (data) {
          setLucrare(data)
          setStatusLucrare(data.statusLucrare)
        } else {
          setError("Lucrarea nu a fost găsită")
        }
      } catch (err) {
        console.error("Eroare la încărcarea lucrării:", err)
        setError("A apărut o eroare la încărcarea lucrării")
      } finally {
        setLoading(false)
      }
    }

    fetchLucrare()
  }, [params.id])

  const clearSignature = () => {
    signatureRef?.clear()
    setIsSigned(false)
  }

  const handleSubmit = async () => {
    if (step === "verificare") {
      if (statusLucrare !== "Finalizat") {
        alert("Lucrarea trebuie să fie marcată ca Finalizată înainte de a genera raportul.")
        return
      }

      try {
        // Actualizăm statusul lucrării în baza de date
        await updateLucrare(params.id, { statusLucrare: "Finalizat" })
        setStep("semnare")
      } catch (err) {
        console.error("Eroare la actualizarea statusului lucrării:", err)
        alert("A apărut o eroare la actualizarea statusului lucrării.")
      }
      return
    }

    if (step === "semnare") {
      if (signatureRef?.isEmpty()) {
        alert("Vă rugăm să semnați raportul înainte de a-l trimite.")
        return
      }

      setIsSubmitted(true)
      setStep("finalizat")

      // In a real app, here you would:
      // 1. Convert signature to image
      // 2. Generate PDF with signature
      // 3. Send PDF via email
      // 4. Save to database
    }
  }

  const handleStatusChange = (value: string) => {
    setStatusLucrare(value)
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-3xl">
        <CardHeader className="text-center">
          <div className="flex items-center">
            <Button variant="ghost" size="icon" className="absolute left-4" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div className="w-full">
              <CardTitle className="text-xl sm:text-2xl font-bold text-blue-700">
                Raport Intervenție #{params.id}
              </CardTitle>
              <CardDescription>Detalii despre intervenția efectuată</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {isSubmitted ? (
            <div className="flex flex-col items-center justify-center space-y-4 py-12">
              <div className="rounded-full bg-green-100 p-3">
                <Check className="h-8 w-8 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold">Raport Trimis cu Succes!</h2>
              <p className="text-center text-gray-500">
                Raportul a fost generat și trimis pe email către client și echipa internă.
              </p>
              <Button className="mt-4 gap-2">
                <Download className="h-4 w-4" /> Descarcă PDF
              </Button>
            </div>
          ) : step === "verificare" ? (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-medium text-gray-500">Client</h3>
                  <p>{lucrare?.client}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Locație</h3>
                  <p>{lucrare?.locatie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                  <p>{lucrare?.dataInterventie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Tehnician</h3>
                  <p>{lucrare?.tehnicieni?.join(", ")}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
                <p>{lucrare?.descriere}</p>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-medium text-gray-500">Status Lucrare</h3>
                <Select value={statusLucrare} onValueChange={handleStatusChange}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Selectați statusul" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="În așteptare">În așteptare</SelectItem>
                    <SelectItem value="În curs">În curs</SelectItem>
                    <SelectItem value="Finalizat">Finalizat</SelectItem>
                  </SelectContent>
                </Select>
                {statusLucrare !== "Finalizat" && (
                  <p className="text-sm text-red-500">
                    Lucrarea trebuie să fie marcată ca Finalizată înainte de a genera raportul.
                  </p>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <h3 className="font-medium text-gray-500">Client</h3>
                  <p>{lucrare?.client}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Locație</h3>
                  <p>{lucrare?.locatie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Data Intervenție</h3>
                  <p>{lucrare?.dataInterventie}</p>
                </div>
                <div>
                  <h3 className="font-medium text-gray-500">Tehnician</h3>
                  <p>{lucrare?.tehnicieni?.join(", ")}</p>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium text-gray-500">Descriere Intervenție</h3>
                <p>{lucrare?.descriere}</p>
              </div>

              <div>
                <h3 className="font-medium text-gray-500">Lucrări Efectuate</h3>
                <ul className="list-inside list-disc">
                  <li>Înlocuire panou deteriorat</li>
                  <li>Reglare sistem de închidere</li>
                  <li>Testare funcționalitate</li>
                </ul>
              </div>

              <div>
                <h3 className="font-medium text-gray-500">Materiale Utilizate</h3>
                <ul className="list-inside list-disc">
                  <li>Panou secțional 1000x500mm - 1 buc</li>
                  <li>Set șuruburi fixare - 1 set</li>
                  <li>Spray lubrifiant - 1 buc</li>
                </ul>
              </div>

              <Separator />

              <div className="space-y-2">
                <h3 className="font-medium text-gray-500">Semnătură Client</h3>
                <div className="rounded-md border border-gray-300 bg-white p-2">
                  <SignatureCanvas
                    ref={(ref) => setSignatureRef(ref)}
                    canvasProps={{
                      className: "w-full h-40 border rounded",
                      style: { width: "100%", height: "160px" },
                    }}
                    onEnd={() => setIsSigned(true)}
                  />
                </div>
                <div className="flex justify-end">
                  <Button variant="outline" size="sm" onClick={clearSignature}>
                    Șterge
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
        {!isSubmitted && (
          <CardFooter className="flex flex-col sm:flex-row gap-2 justify-between">
            <Button variant="outline" onClick={() => router.back()}>
              Înapoi
            </Button>
            <Button
              className="gap-2 bg-blue-600 hover:bg-blue-700 w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={step === "verificare" ? statusLucrare !== "Finalizat" : !isSigned}
            >
              {step === "verificare" ? (
                <>Continuă spre semnare</>
              ) : (
                <>
                  <Send className="h-4 w-4" /> Generează și Trimite Raport
                </>
              )}
            </Button>
          </CardFooter>
        )}
      </Card>
    </div>
  )
}
