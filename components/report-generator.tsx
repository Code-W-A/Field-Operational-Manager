"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { toast } from "@/components/ui/use-toast"
import { Printer, Download, FileText, CheckCircle } from "lucide-react"
import { getLucrareById, updateLucrare } from "@/lib/firebase/firestore"
import { useAuth } from "@/contexts/AuthContext"
import { EmailSender } from "@/components/email-sender"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { SignaturePad } from "@/components/signature-pad"
import { ProductTableForm } from "@/components/product-table-form"
import { formatDate } from "@/lib/utils/date-formatter"
import { useStableCallback } from "@/lib/utils/hooks"
import type { Lucrare } from "@/lib/firebase/firestore"

interface ReportGeneratorProps {
  lucrareId: string
}

export function ReportGenerator({ lucrareId }: ReportGeneratorProps) {
  const [lucrare, setLucrare] = useState<Lucrare | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("preview")
  const [clientSignature, setClientSignature] = useState<string | null>(null)
  const [tehnicianSignature, setTehnicianSignature] = useState<string | null>(null)
  const [products, setProducts] = useState<any[]>([])
  const [isReportGenerated, setIsReportGenerated] = useState(false)
  const { userData } = useAuth()
  const role = userData?.role || "tehnician"
  const reportRef = useRef<HTMLDivElement>(null)

  // Încărcăm datele lucrării
  useEffect(() => {
    const fetchLucrare = async () => {
      try {
        const data = await getLucrareById(lucrareId)
        setLucrare(data)

        // Verificăm dacă raportul a fost deja generat
        if (data.raportGenerat) {
          setIsReportGenerated(true)
          setClientSignature(data.clientSignature || null)
          setTehnicianSignature(data.tehnicianSignature || null)
          setProducts(data.products || [])
        }
      } catch (error) {
        console.error("Eroare la încărcarea lucrării:", error)
        toast({
          title: "Eroare",
          description: "Nu s-a putut încărca lucrarea.",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchLucrare()
  }, [lucrareId])

  // Funcție pentru a genera PDF-ul
  const handleGeneratePDF = useStableCallback(async () => {
    if (!lucrare) return

    // Verificăm dacă avem semnăturile necesare
    if (!clientSignature || !tehnicianSignature) {
      toast({
        title: "Semnături lipsă",
        description: "Ambele semnături (client și tehnician) sunt necesare pentru a genera raportul.",
        variant: "destructive",
      })
      return
    }

    try {
      // Actualizăm lucrarea cu semnăturile și produsele
      await updateLucrare(lucrareId, {
        clientSignature,
        tehnicianSignature,
        products,
        raportGenerat: true,
        raportGeneratAt: new Date().toISOString(),
        raportGeneratBy: userData?.displayName || "Tehnician necunoscut",
        statusLucrare: "Finalizat", // Setăm statusul lucrării la "Finalizat" când se generează raportul
      })

      setIsReportGenerated(true)

      toast({
        title: "Raport generat",
        description: "Raportul a fost generat cu succes și poate fi descărcat sau trimis pe email.",
      })
    } catch (error) {
      console.error("Eroare la generarea raportului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la generarea raportului.",
        variant: "destructive",
      })
    }
  })

  // Funcție pentru a descărca PDF-ul
  const handleDownloadPDF = useStableCallback(() => {
    // Implementare pentru descărcarea PDF-ului
    toast({
      title: "Descărcare raport",
      description: "Raportul se descarcă...",
    })
  })

  // Funcție pentru a imprima PDF-ul
  const handlePrintPDF = useStableCallback(() => {
    window.print()
  })

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900"></div>
      </div>
    )
  }

  if (!lucrare) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <AlertTitle>Eroare</AlertTitle>
          <AlertDescription>Nu s-a putut încărca lucrarea. Vă rugăm să încercați din nou.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="preview">Previzualizare</TabsTrigger>
          <TabsTrigger value="signatures" disabled={isReportGenerated && role === "tehnician"}>
            Semnături
          </TabsTrigger>
          <TabsTrigger value="products" disabled={isReportGenerated && role === "tehnician"}>
            Produse
          </TabsTrigger>
        </TabsList>

        <TabsContent value="preview">
          <Card>
            <CardHeader>
              <CardTitle>Previzualizare raport intervenție</CardTitle>
              <CardDescription>Verificați informațiile raportului înainte de a-l genera și trimite.</CardDescription>
            </CardHeader>
            <CardContent>
              {isReportGenerated && role === "tehnician" ? (
                <Alert className="mb-4 bg-green-50 border-green-200">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertTitle>Raport finalizat cu succes!</AlertTitle>
                  <AlertDescription>
                    Raportul pentru această lucrare a fost generat. Puteți descărca sau trimite raportul pe email.
                  </AlertDescription>
                </Alert>
              ) : null}

              <div ref={reportRef} className="p-4 border rounded-lg print:border-none">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <h2 className="text-xl font-bold">Raport de intervenție</h2>
                    <p className="text-sm text-gray-500">Nr. {lucrare.id?.substring(0, 8).toUpperCase()}</p>
                  </div>
                  <div className="text-right">
                    <img src="/nrglogo.png" alt="Logo" className="h-12" />
                    <p className="text-sm">SC NRG SOLUTIONS SRL</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <h3 className="font-semibold mb-2">Informații client</h3>
                    <p>
                      <span className="font-medium">Client:</span> {lucrare.client}
                    </p>
                    <p>
                      <span className="font-medium">Persoană contact:</span> {lucrare.persoanaContact}
                    </p>
                    <p>
                      <span className="font-medium">Telefon:</span> {lucrare.telefon}
                    </p>
                    <p>
                      <span className="font-medium">Locație:</span> {lucrare.locatie}
                    </p>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Informații intervenție</h3>
                    <p>
                      <span className="font-medium">Data emiterii:</span> {formatDate(lucrare.dataEmiterii)}
                    </p>
                    <p>
                      <span className="font-medium">Data intervenție:</span> {formatDate(lucrare.dataInterventie)}
                    </p>
                    <p>
                      <span className="font-medium">Tip lucrare:</span> {lucrare.tipLucrare}
                    </p>
                    <p>
                      <span className="font-medium">Tehnician:</span> {lucrare.tehnicieni.join(", ")}
                    </p>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="font-semibold mb-2">Detalii echipament</h3>
                  <p>
                    <span className="font-medium">Echipament:</span> {lucrare.echipament}
                  </p>
                  <p>
                    <span className="font-medium">Cod echipament:</span> {lucrare.echipamentCod || "N/A"}
                  </p>
                  {lucrare.defectReclamat && (
                    <p>
                      <span className="font-medium">Defect reclamat:</span> {lucrare.defectReclamat}
                    </p>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="font-semibold mb-2">Descriere intervenție</h3>
                  <p className="whitespace-pre-line">{lucrare.descriereInterventie || "Fără descriere"}</p>
                </div>

                {products && products.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold mb-2">Produse utilizate</h3>
                    <table className="min-w-full border">
                      <thead>
                        <tr className="bg-gray-100">
                          <th className="border p-2 text-left">Denumire</th>
                          <th className="border p-2 text-left">Cantitate</th>
                          <th className="border p-2 text-left">Preț unitar</th>
                          <th className="border p-2 text-left">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {products.map((product, index) => (
                          <tr key={index}>
                            <td className="border p-2">{product.name}</td>
                            <td className="border p-2">{product.quantity}</td>
                            <td className="border p-2">{product.price} RON</td>
                            <td className="border p-2">{product.quantity * product.price} RON</td>
                          </tr>
                        ))}
                        <tr className="font-semibold">
                          <td colSpan={3} className="border p-2 text-right">
                            Total:
                          </td>
                          <td className="border p-2">
                            {products.reduce((sum, product) => sum + product.quantity * product.price, 0)} RON
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div>
                    <h3 className="font-semibold mb-2">Semnătură client</h3>
                    {clientSignature ? (
                      <img
                        src={clientSignature || "/placeholder.svg"}
                        alt="Semnătură client"
                        className="border h-24 w-full object-contain"
                      />
                    ) : (
                      <div className="border h-24 flex items-center justify-center text-gray-400">Semnătură lipsă</div>
                    )}
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Semnătură tehnician</h3>
                    {tehnicianSignature ? (
                      <img
                        src={tehnicianSignature || "/placeholder.svg"}
                        alt="Semnătură tehnician"
                        className="border h-24 w-full object-contain"
                      />
                    ) : (
                      <div className="border h-24 flex items-center justify-center text-gray-400">Semnătură lipsă</div>
                    )}
                  </div>
                </div>

                <div className="text-xs text-gray-500 mt-8">
                  <p>Document generat la data: {new Date().toLocaleDateString()}</p>
                  <p>
                    Acest document reprezintă confirmarea efectuării intervenției și a fost semnat electronic de ambele
                    părți.
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2 justify-between">
              <div className="flex flex-wrap gap-2">
                {isReportGenerated ? (
                  <>
                    <Button onClick={handlePrintPDF}>
                      <Printer className="mr-2 h-4 w-4" /> Printează
                    </Button>
                    <Button onClick={handleDownloadPDF}>
                      <Download className="mr-2 h-4 w-4" /> Descarcă PDF
                    </Button>
                  </>
                ) : (
                  <Button
                    onClick={handleGeneratePDF}
                    disabled={!clientSignature || !tehnicianSignature || (isReportGenerated && role === "tehnician")}
                  >
                    <FileText className="mr-2 h-4 w-4" /> Generează raport
                  </Button>
                )}
              </div>
              {isReportGenerated && (
                <EmailSender
                  lucrareId={lucrareId}
                  clientEmail={lucrare.email}
                  clientName={lucrare.client}
                  subject={`Raport intervenție - ${lucrare.tipLucrare}`}
                />
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="signatures">
          <Card>
            <CardHeader>
              <CardTitle>Semnături</CardTitle>
              <CardDescription>Adăugați semnăturile clientului și tehnicianului.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h3 className="text-lg font-medium mb-2">Semnătură client</h3>
                <SignaturePad
                  value={clientSignature}
                  onChange={setClientSignature}
                  disabled={isReportGenerated && role === "tehnician"}
                />
              </div>
              <div>
                <h3 className="text-lg font-medium mb-2">Semnătură tehnician</h3>
                <SignaturePad
                  value={tehnicianSignature}
                  onChange={setTehnicianSignature}
                  disabled={isReportGenerated && role === "tehnician"}
                />
              </div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => setActiveTab("preview")}>Înapoi la previzualizare</Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Produse utilizate</CardTitle>
              <CardDescription>Adăugați produsele utilizate în timpul intervenției.</CardDescription>
            </CardHeader>
            <CardContent>
              <ProductTableForm
                products={products}
                onChange={setProducts}
                disabled={isReportGenerated && role === "tehnician"}
              />
            </CardContent>
            <CardFooter>
              <Button onClick={() => setActiveTab("preview")}>Înapoi la previzualizare</Button>
            </CardFooter>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
