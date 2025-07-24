"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/components/ui/use-toast"
import { Upload, Camera, X, AlertCircle, Image as ImageIcon } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface ImageDefectUploadProps {
  lucrareId: string
  lucrare: any
  onLucrareUpdate: (updatedLucrare: any) => void
  necesitaOferta: boolean // Condiția pentru afișare
}

export function ImageDefectUpload({ lucrareId, lucrare, onLucrareUpdate, necesitaOferta }: ImageDefectUploadProps) {
  const { userData } = useAuth()
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxImages = 3
  const currentImages = lucrare.imaginiDefecte || []

  // Funcție pentru compresia imaginilor
  const compressImage = (file: File, maxWidth = 1200, quality = 0.8): Promise<File> => {
    return new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      const ctx = canvas.getContext('2d')
      const img = new Image()

      img.onload = () => {
        // Calculează dimensiunile noi menținând raportul de aspect
        let { width, height } = img
        if (width > maxWidth) {
          height = (height * maxWidth) / width
          width = maxWidth
        }

        canvas.width = width
        canvas.height = height

        // Desenează imaginea comprimată
        ctx?.drawImage(img, 0, 0, width, height)

        // Convertește în blob cu calitatea specificată
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: 'image/jpeg', // Convertim tot în JPEG pentru comprimare optimă
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              resolve(file) // Fallback la fișierul original
            }
          },
          'image/jpeg',
          quality
        )
      }

      img.src = URL.createObjectURL(file)
    })
  }

  // Funcție pentru validarea fișierului imagine
  const validateImageFile = (file: File): string | null => {
    if (!file.type.startsWith('image/')) {
      return "Doar fișiere imagine sunt permise."
    }
    if (file.size > 50 * 1024 * 1024) { // 50MB limită brută
      return "Fișierul nu poate fi mai mare de 50MB."
    }
    return null
  }

  // Funcție pentru upload imagini
  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Verificăm limita de imagini
    if (currentImages.length + files.length > maxImages) {
      toast({
        title: "Prea multe imagini",
        description: `Puteți încărca maxim ${maxImages} imagini. Aveți deja ${currentImages.length} imaginea(ea) încărcată(e).`,
        variant: "destructive",
      })
      return
    }

    setIsUploading(true)

    try {
      const uploadPromises = files.map(async (file) => {
        // Validăm fișierul
        const validationError = validateImageFile(file)
        if (validationError) {
          throw new Error(validationError)
        }

        // Comprimăm imaginea
        const compressedFile = await compressImage(file)
        
        console.log(`📷 Comprimare imaginea: ${file.name}`)
        console.log(`📊 Dimensiune originală: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        console.log(`📊 Dimensiune comprimată: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)

        // Încărcăm în Firebase Storage
        const timestamp = Date.now()
        const fileExtension = 'jpg' // Toate imaginile devin JPG după comprimare
        const storagePath = `lucrari/${lucrareId}/imagini_defecte/img_${timestamp}_${Math.random().toString(36).substr(2, 9)}.${fileExtension}`
        
        const { url, fileName } = await uploadFile(compressedFile, storagePath)

        return {
          url,
          fileName: file.name, // Păstrăm numele original pentru display
          uploadedAt: new Date().toISOString(),
          uploadedBy: userData?.displayName || userData?.email || "Unknown",
          compressed: true,
        }
      })

      const uploadedImages = await Promise.all(uploadPromises)

      // Actualizăm array-ul de imagini
      const updatedImages = [...currentImages, ...uploadedImages]
      await updateLucrare(lucrareId, { imaginiDefecte: updatedImages })

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, imaginiDefecte: updatedImages }
      onLucrareUpdate(updatedLucrare)

      toast({
        title: "Imagini încărcate",
        description: `${uploadedImages.length} imaginea(ea) a(au) fost încărcată(e) și comprimată(e) cu succes.`,
      })
    } catch (error) {
      console.error("Eroare la încărcarea imaginilor:", error)
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu s-a putut încărca imaginea.",
        variant: "destructive",
      })
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  // Funcție pentru ștergerea imaginilor
  const handleDeleteImage = async (index: number) => {
    const imageToDelete = currentImages[index]
    if (!imageToDelete) return

    if (!window.confirm("Sigur doriți să ștergeți această imagine?")) {
      return
    }

    try {
      // Extragem path-ul din URL pentru ștergere din Storage
      const pathMatch = imageToDelete.url.match(/lucrari%2F[^?]+/)
      if (pathMatch) {
        const storagePath = decodeURIComponent(pathMatch[0].replace(/%2F/g, '/'))
        await deleteFile(storagePath)
      }

      // Actualizăm array-ul de imagini
      const updatedImages = currentImages.filter((_: any, i: number) => i !== index)
      await updateLucrare(lucrareId, { imaginiDefecte: updatedImages })

      // Actualizăm starea locală
      const updatedLucrare = { ...lucrare, imaginiDefecte: updatedImages }
      onLucrareUpdate(updatedLucrare)

      toast({
        title: "Imagine ștearsă",
        description: "Imaginea a fost ștearsă cu succes.",
      })
    } catch (error) {
      console.error("Eroare la ștergerea imaginii:", error)
      toast({
        title: "Eroare",
        description: "Nu s-a putut șterge imaginea.",
        variant: "destructive",
      })
    }
  }

  // Nu afișăm componenta dacă nu este necesară ofertă
  if (!necesitaOferta) {
    return null
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          Imagini defecte constatate
        </CardTitle>
        <CardDescription>
          Încărcați imagini cu defectele constatate (maxim {maxImages} imagini, comprimare automată)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
      
        {/* Afișarea imaginilor existente */}
        {currentImages.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Imagini încărcate ({currentImages.length}/{maxImages})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentImages.map((image: any, index: number) => (
                <div key={index} className="relative group">
                  <div className="aspect-video relative rounded-lg overflow-hidden border bg-gray-100">
                    <img
                      src={image.url}
                      alt={`Defect ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all duration-200 flex items-center justify-center">
                      <Button
                        variant="destructive"
                        size="sm"
                        className="opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={() => handleDeleteImage(index)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    <p className="truncate">{image.fileName}</p>
                    <p>Încărcată pe {new Date(image.uploadedAt).toLocaleDateString('ro-RO')}</p>
                    {image.compressed && (
                      <Badge variant="secondary" className="text-xs mt-1">
                        Comprimată
                      </Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload nou (doar dacă nu am atins limita) */}
        {currentImages.length < maxImages && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Adăugați imagini noi (maxim {maxImages - currentImages.length} imagini)
            </h4>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Se încarcă și se comprimă..." : "Selectează imagini defecte"}
              </Button>
            </div>
          </div>
        )}

        {/* Informații tehnice */}
        <div className="text-xs text-gray-500 p-3 bg-gray-50 rounded-lg">
          <p><strong>Specificații tehnice:</strong></p>
          <ul className="list-disc list-inside mt-1 space-y-1">
            <li>Maxim {maxImages} imagini per lucrare</li>
            <li>Doar fișiere imagine sunt acceptate</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
} 