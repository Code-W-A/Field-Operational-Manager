"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Upload, Trash2, Loader2 } from "lucide-react"
import { uploadFile, deleteFile, getFileUrl } from "@/lib/firebase/storage"
import { toast } from "@/components/ui/use-toast"
import Image from "next/image"

export function CompanyLogoManager() {
  const [logo, setLogo] = useState<string | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [isLoading, setIsLoading] = useState(true)

  // Încărcăm logo-ul existent la inițializarea componentei
  useEffect(() => {
    const fetchLogo = async () => {
      try {
        setIsLoading(true)
        const logoUrl = await getFileUrl("settings/company-logo.png").catch(() => null)
        if (logoUrl) {
          setLogo(logoUrl)
        }
      } catch (error) {
        console.error("Eroare la încărcarea logo-ului:", error)
      } finally {
        setIsLoading(false)
      }
    }

    fetchLogo()
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Verificăm dacă fișierul este o imagine
    if (!file.type.startsWith("image/")) {
      toast({
        title: "Eroare",
        description: "Vă rugăm să selectați un fișier imagine (PNG, JPG, etc.)",
        variant: "destructive",
      })
      return
    }

    // Verificăm dimensiunea fișierului (max 2MB)
    if (file.size > 2 * 1024 * 1024) {
      toast({
        title: "Eroare",
        description: "Fișierul este prea mare. Dimensiunea maximă este de 2MB.",
        variant: "destructive",
      })
      return
    }

    try {
      setIsUploading(true)

      // Încărcăm fișierul în Firebase Storage
      const result = await uploadFile(file, "settings/company-logo.png")

      // Actualizăm starea cu noul URL
      setLogo(result.url)

      toast({
        title: "Succes",
        description: "Logo-ul companiei a fost încărcat cu succes.",
      })
    } catch (error) {
      console.error("Eroare la încărcarea logo-ului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la încărcarea logo-ului. Încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  const handleDeleteLogo = async () => {
    if (!logo) return

    if (!confirm("Sunteți sigur că doriți să ștergeți logo-ul companiei?")) {
      return
    }

    try {
      setIsUploading(true)

      // Ștergem fișierul din Firebase Storage
      await deleteFile("settings/company-logo.png")

      // Resetăm starea
      setLogo(null)

      toast({
        title: "Succes",
        description: "Logo-ul companiei a fost șters cu succes.",
      })
    } catch (error) {
      console.error("Eroare la ștergerea logo-ului:", error)
      toast({
        title: "Eroare",
        description: "A apărut o eroare la ștergerea logo-ului. Încercați din nou.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Logo Companie</CardTitle>
        <CardDescription>Încărcați logo-ul companiei pentru a fi afișat în antetul rapoartelor PDF.</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center items-center h-40">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        ) : logo ? (
          <div className="flex flex-col items-center space-y-4">
            <div className="relative w-64 h-32 border rounded-md overflow-hidden">
              <Image
                src={logo || "/placeholder.svg"}
                alt="Logo companie"
                fill
                style={{ objectFit: "contain" }}
                sizes="(max-width: 768px) 100vw, 256px"
              />
            </div>
            <p className="text-sm text-muted-foreground">Logo-ul va fi afișat în antetul rapoartelor PDF.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-40 border-2 border-dashed rounded-md">
            <Upload className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground mb-4">Încărcați logo-ul companiei (format PNG sau JPG)</p>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <div className="flex-1">
          <Input
            type="file"
            id="logo-upload"
            className="hidden"
            accept="image/*"
            onChange={handleFileChange}
            disabled={isUploading}
          />
          <Label htmlFor="logo-upload" className="w-full">
            <Button variant={logo ? "outline" : "default"} className="w-full" disabled={isUploading} asChild>
              <span>
                {isUploading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Se încarcă...
                  </>
                ) : logo ? (
                  <>
                    <Upload className="mr-2 h-4 w-4" /> Schimbă logo
                  </>
                ) : (
                  <>
                    <Upload className="mr-2 h-4 w-4" /> Încarcă logo
                  </>
                )}
              </span>
            </Button>
          </Label>
        </div>
        {logo && (
          <Button variant="destructive" onClick={handleDeleteLogo} disabled={isUploading} className="ml-2">
            <Trash2 className="h-4 w-4" />
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
