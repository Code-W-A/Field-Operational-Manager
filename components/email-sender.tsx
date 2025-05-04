"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "@/components/ui/use-toast"
import { Send } from "lucide-react"
import { useStableCallback } from "@/lib/utils/hooks"

interface EmailSenderProps {
  lucrareId: string
  clientEmail?: string
  clientName?: string
  subject?: string
}

export function EmailSender({ lucrareId, clientEmail = "", clientName = "", subject = "" }: EmailSenderProps) {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState(clientEmail)
  const [emailSubject, setEmailSubject] = useState(subject || `Raport intervenție - ${clientName}`)
  const [message, setMessage] = useState(
    `Bună ziua,\n\nAtașat găsiți raportul de intervenție pentru lucrarea efectuată.\n\nCu stimă,\nEchipa NRG Solutions`,
  )

  const handleSendEmail = useStableCallback(async () => {
    if (!email) {
      toast({
        title: "Eroare",
        description: "Adresa de email este obligatorie.",
        variant: "destructive",
      })
      return
    }

    setLoading(true)

    try {
      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: email,
          subject: emailSubject,
          text: message,
          html: message.replace(/\n/g, "<br>"),
          lucrareId,
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || "A apărut o eroare la trimiterea emailului.")
      }

      toast({
        title: "Email trimis",
        description: "Emailul a fost trimis cu succes.",
      })

      setOpen(false)
    } catch (error) {
      console.error("Eroare la trimiterea emailului:", error)
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "A apărut o eroare la trimiterea emailului.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  })

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Send className="mr-2 h-4 w-4" /> Trimite pe email
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Trimite raport pe email</DialogTitle>
          <DialogDescription>Completați detaliile pentru a trimite raportul pe email.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="email" className="text-right">
              Email
            </Label>
            <Input
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="subject" className="text-right">
              Subiect
            </Label>
            <Input
              id="subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="message" className="text-right">
              Mesaj
            </Label>
            <Textarea
              id="message"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="col-span-3"
              rows={6}
            />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" onClick={handleSendEmail} disabled={loading}>
            {loading ? "Se trimite..." : "Trimite email"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
