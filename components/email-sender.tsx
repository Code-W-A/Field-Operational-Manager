"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Send, Loader2 } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { ReportGenerator } from "@/components/report-generator"
import type { Lucrare } from "@/lib/firebase/firestore"
import { getFileUrl } from "@/lib/firebase/storage"

interface EmailSenderProps {
  lucrare: Lucrare
  defaultEmail?: string
}

export function EmailSender({ lucrare, defaultEmail = "" }: EmailSenderProps) {
  const [email, setEmail] = useState(defaultEmail)
  const [subject, setSubject] = useState(`Raport Intervenție - ${lucrare.client} - ${lucrare.dataInterventie}`)
  const [message, setMessage] = useState(
    `Stimată/Stimate ${lucrare.persoanaContact},

Vă transmitem atașat raportul de intervenție pentru lucrarea efectuată în data de ${lucrare.dataInterventie}.

Cu stimă,
Echipa de intervenție`,
  )
  const [isGenerating, setIsGenerating] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [companyLogo, setCompanyLogo] = useState<string | null>(null)
  const reportGeneratorRef = useRef<HTMLButtonElement>(null)

  // Încărcăm logo-ul companiei
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        const logoUrl = await getFileUrl("settings/company-logo.png").catch(() => null)
        if (logoUrl) {
          setCompanyLogo(logoUrl)
        }
      } catch (error) {
        console.error("Eroare la încărcarea logo-ului:", error)
      }
    }

    fetchLogo()
  }, [])

  const handleGeneratePDF = (blob: Blob) => {
    setPdfBlob(blob)
  }

  const handleSendEmail = async () => {
    // Validăm câmpurile obligatorii
    if (!email) {
      toast({
        title: "Eroare",
        description: "Adresa de email este obligatorie",
        variant: "destructive",
      })
      return
    }

    if (!subject) {
      toast({
        title: "Eroare",
        description: "Subiectul este obligatoriu",
        variant: "destructive",
      })
      return
    }

    // Dacă nu avem PDF-ul generat, generăm unul
    if (!pdfBlob) {
      // Simulăm click pe butonul de generare PDF
      if (reportGeneratorRef.current) {
        reportGeneratorRef.current.click()
      }
      toast({
        title: "Generare PDF",
        description: "Vă rugăm să generați mai întâi PDF-ul",
      })
      return
    }

    try {
      setIsSending(true)

      // Creăm un FormData pentru a trimite fișierul PDF
      const formData = new FormData()
      formData.append("to", email)
      formData.append("subject", subject)
      formData.append("message", message)
      formData.append("senderName", `Echipa de intervenție - ${lucrare.tehnicieni?.join(", ")}`)

      // Adăugăm PDF-ul ca fișier
      const pdfFile = new File([pdfBlob], `Raport_Interventie_${lucrare.id}.pdf`, { type: "application/pdf" })
      formData.append("pdfFile", pdfFile)

      // Adăugăm logo-ul companiei dacă există
      if (companyLogo) {
        formData.append("companyLogo", companyLogo)
      }

      // Trimitem cererea către API
      const response = await fetch("/api/send-email", {
        method: "POST",
        body: formData,
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "A apărut o eroare la trimiterea emailului")
      }

      toast({
        title: "Email trimis cu succes",
        description: `Raportul a fost trimis la adresa ${email}`,
      })
    } catch (error) {
      console.error("Eroare la trimiterea emailului:", error)
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "A apărut o eroare la trimiterea emailului",
        variant: "destructive",
      })
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="hidden">
        <ReportGenerator lucrare={lucrare} onGenerate={handleGeneratePDF} ref={reportGeneratorRef} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Adresă Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="subject">Subiect</Label>
        <Input
          id="subject"
          placeholder="Subiect email"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="message">Mesaj</Label>
        <Textarea
          id="message"
          placeholder="Introduceți mesajul"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
        />
      </div>

      <div className="flex flex-col space-y-2">
        <Button
          onClick={() => {
            setIsGenerating(true)
            const generatorButton = document.createElement("button")
            generatorButton.onclick = () => {
              const reportGenerator = new ReportGenerator({
                lucrare,
                onGenerate: (blob) => {
                  setPdfBlob(blob)
                  setIsGenerating(false)
                  toast({
                    title: "PDF generat cu succes",
                    description: "Acum puteți trimite emailul",
                  })
                },
              })
              reportGenerator.generatePDF()
            }
            generatorButton.click()
          }}
          disabled={isGenerating}
          variant="outline"
        >
          {isGenerating ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se generează PDF...
            </>
          ) : pdfBlob ? (
            "Regenerează PDF"
          ) : (
            "Generează PDF"
          )}
        </Button>

        <Button onClick={handleSendEmail} disabled={isSending || isGenerating} className="gap-2">
          {isSending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se trimite...
            </>
          ) : (
            <>
              <Send className="h-4 w-4" /> Trimite Email
            </>
          )}
        </Button>
      </div>
    </div>
  )
}
