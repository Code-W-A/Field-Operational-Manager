"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { uploadFile, deleteFile } from "@/lib/firebase/storage"
import { updateLucrare } from "@/lib/firebase/firestore"
import { toast } from "@/hooks/use-toast"
import { Upload, Camera, X, AlertCircle, Image as ImageIcon, Trash2 } from "lucide-react"
import { useAuth } from "@/contexts/AuthContext"

interface ImageDefectUploadProps {
  lucrareId: string
  lucrare: any
  selectedImages: File[] // Imaginile selectate, gestionate de părinte
  imagePreviews: string[] // URL-urile pentru preview, gestionate de părinte
  imagesToDelete: number[] // Indicii imaginilor marcate pentru ștergere
  onImagesChange: (images: File[], previews: string[]) => void // Callback pentru imaginile selectate local
  onImageDeleted?: (deletedImageIndex: number) => void // Callback pentru imaginile uplodate șterse
  isUploading?: boolean // Loading state controlat de component părinte
}

export function ImageDefectUpload({ lucrareId, lucrare, selectedImages, imagePreviews, imagesToDelete, onImagesChange, onImageDeleted, isUploading = false }: ImageDefectUploadProps) {
  const { userData } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const maxImages = 4
  const currentImages = lucrare.imaginiDefecte || [] // Imaginile deja uplodate

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

  // Funcție pentru selectarea imaginilor (fără upload imediat)
  const handleImageSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    // Verificăm limita de imagini (incluzând cele deja selectate și cele uplodate)
    const totalImages = currentImages.length + selectedImages.length + files.length
    if (totalImages > maxImages) {
      toast({
        title: "Prea multe imagini",
        description: `Puteți încărca maxim ${maxImages} imagini total. Aveți deja ${currentImages.length + selectedImages.length} imaginile selectate.`,
        variant: "destructive",
      })
      return
    }

    try {
      const processedFiles: File[] = []
      const newPreviews: string[] = []

      for (const file of files) {
        // Validăm fișierul
        const validationError = validateImageFile(file)
        if (validationError) {
          toast({
            title: "Fișier invalid",
            description: `${file.name}: ${validationError}`,
            variant: "destructive",
          })
          continue
        }

        // Comprimăm imaginea
        const compressedFile = await compressImage(file)
        
        console.log(`📷 Comprimare imaginea: ${file.name}`)
        console.log(`📊 Dimensiune originală: ${(file.size / 1024 / 1024).toFixed(2)}MB`)
        console.log(`📊 Dimensiune comprimată: ${(compressedFile.size / 1024 / 1024).toFixed(2)}MB`)

        // Creăm preview URL
        const previewUrl = URL.createObjectURL(compressedFile)
        
        processedFiles.push(compressedFile)
        newPreviews.push(previewUrl)
      }

      // Actualizăm starea locală prin componenta părinte
      const updatedSelectedImages = [...selectedImages, ...processedFiles]
      const updatedPreviews = [...imagePreviews, ...newPreviews]
      
      // Informăm componenta părinte despre imaginile selectate
      onImagesChange(updatedSelectedImages, updatedPreviews)

      if (processedFiles.length > 0) {
        toast({
          title: "Imagini selectate",
          description: `${processedFiles.length} imaginile au fost selectate și comprimate. Vor fi uplodate la salvarea formularului.`,
        })
      }
    } catch (error) {
      console.error("Eroare la procesarea imaginilor:", error)
      toast({
        title: "Eroare",
        description: error instanceof Error ? error.message : "Nu s-a putut procesa imaginea.",
        variant: "destructive",
      })
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  // Funcție pentru marcarea/demarcarea imaginilor pentru ștergere
  const handleMarkImageForDeletion = (index: number) => {
    const isAlreadyMarked = imagesToDelete.includes(index)
    
    if (isAlreadyMarked) {
      // Dacă e deja marcată, confirmăm demarcarea
      if (window.confirm("Imaginea este marcată pentru ștergere. Doriți să o păstrați?")) {
        if (onImageDeleted) {
          onImageDeleted(index) // Demarcarea se face prin același callback
        }
      }
    } else {
      // Marcăm pentru ștergere
      if (window.confirm("Marcați imaginea pentru ștergere? Aceasta va fi eliminată când salvați datele.")) {
        if (onImageDeleted) {
          onImageDeleted(index)
        }
      }
    }
  }

  // Funcție pentru ștergerea imaginilor selectate local
  const handleDeleteSelectedImage = (index: number) => {
    if (!window.confirm("Sigur doriți să ștergeți această imagine din selecție?")) {
      return
    }

    // Revocăm URL-ul pentru preview pentru a elibera memoria
    if (imagePreviews[index]) {
      URL.revokeObjectURL(imagePreviews[index])
    }

    // Actualizăm array-urile locale prin componenta părinte
    const updatedSelectedImages = selectedImages.filter((_, i) => i !== index)
    const updatedPreviews = imagePreviews.filter((_, i) => i !== index)
    
    // Informăm componenta părinte
    onImagesChange(updatedSelectedImages, updatedPreviews)

    toast({
      title: "Imagine ștearsă",
      description: "Imaginea a fost ștearsă din selecție.",
    })
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
      
        {/* Afișarea imaginilor existente (deja uplodate) */}
        {currentImages.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Imagini uplodate ({currentImages.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {currentImages.map((image: any, index: number) => {
                const isMarkedForDeletion = imagesToDelete.includes(index)
                
                return (
                  <div key={`uploaded-${index}`} className="relative group">
                    <div className={`aspect-video relative rounded-lg overflow-hidden border bg-gray-100 ${
                      isMarkedForDeletion ? 'opacity-50 border-red-300' : ''
                    }`}>
                      <img
                        src={image.url}
                        alt={`Defect uploadat ${index + 1}`}
                        className={`w-full h-full object-cover ${
                          isMarkedForDeletion ? 'grayscale' : ''
                        }`}
                        loading="lazy"
                      />
                      <Badge 
                        variant={isMarkedForDeletion ? "destructive" : "secondary"} 
                        className="absolute top-2 left-2 text-xs"
                      >
                        {isMarkedForDeletion ? "Va fi ștearsă" : "Uploadat"}
                      </Badge>
                      <Button
                        type="button"
                        variant={isMarkedForDeletion ? "outline" : "destructive"}
                        size="sm"
                        className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full shadow-md"
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          handleMarkImageForDeletion(index)
                        }}
                        disabled={isUploading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                      {isMarkedForDeletion && (
                        <div className="absolute inset-0 bg-red-500 bg-opacity-20 flex items-center justify-center">
                          <div className="bg-red-600 text-white px-2 py-1 rounded text-xs font-medium">
                            Va fi ștearsă la salvare sau la generarea raportului
                          </div>
                        </div>
                      )}
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
                )
              })}
            </div>
          </div>
        )}

        {/* Afișarea imaginilor selectate local */}
        {selectedImages.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">Imagini selectate ({selectedImages.length})</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {selectedImages.map((image: File, index: number) => (
                <div key={`selected-${index}`} className="relative">
                  <div className="aspect-video relative rounded-lg overflow-hidden border bg-gray-100">
                    <img
                      src={imagePreviews[index]}
                      alt={`Defect selectat ${index + 1}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    <Button
                      type="button"
                      variant="destructive"
                      size="sm"
                      className="absolute top-2 right-2 h-8 w-8 p-0 rounded-full shadow-md"
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleDeleteSelectedImage(index)
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    <p className="truncate">{image.name}</p>
                    
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upload nou (doar dacă nu am atins limita) */}
        {(currentImages.length + selectedImages.length) < maxImages && (
          <div className="space-y-3">
            <h4 className="text-sm font-medium">
              Adăugați imagini noi (mai puteți selecta {maxImages - currentImages.length - selectedImages.length} imagini)
            </h4>
            <div className="space-y-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleImageSelection(e)
                }}
                className="hidden"
                disabled={isUploading}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                variant="outline"
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                {isUploading ? "Se încarcă și se comprimă..." : "Selectează imagini"}
              </Button>
            </div>
          </div>
        )}

        {/* Informații tehnice și status */}
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