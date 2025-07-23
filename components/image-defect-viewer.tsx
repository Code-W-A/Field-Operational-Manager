"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Camera, Download, ExternalLink } from "lucide-react"
import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface ImageDefectViewerProps {
  imaginiDefecte?: Array<{
    url: string
    fileName: string
    uploadedAt: string
    uploadedBy: string
    compressed: boolean
  }>
  userRole: string
}

export function ImageDefectViewer({ imaginiDefecte, userRole }: ImageDefectViewerProps) {
  const [selectedImage, setSelectedImage] = useState<string | null>(null)

  // Nu afișăm componenta pentru tehnicieni sau dacă nu sunt imagini
  if (userRole === "tehnician" || !imaginiDefecte || imaginiDefecte.length === 0) {
    return null
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5" />
            Imagini defecte constatate de tehnician
          </CardTitle>
          <CardDescription>
            Imagini încărcate de tehnician cu defectele identificate ({imaginiDefecte.length} imaginea(ea))
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {imaginiDefecte.map((image, index) => (
              <div key={index} className="space-y-2">
                <div 
                  className="aspect-video relative rounded-lg overflow-hidden border bg-gray-100 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedImage(image.url)}
                >
                  <img
                    src={image.url}
                    alt={`Defect ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute top-2 right-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 w-8 p-0"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(image.url, '_blank')
                      }}
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium truncate">{image.fileName}</p>
                    {image.compressed && (
                      <Badge variant="secondary" className="text-xs">
                        Comprimată
                      </Badge>
                    )}
                  </div>
                  
                  <div className="text-xs text-gray-500 space-y-1">
                    <p><strong>Încărcat de:</strong> {image.uploadedBy}</p>
                    <p><strong>Data:</strong> {new Date(image.uploadedAt).toLocaleDateString('ro-RO', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</p>
                  </div>

                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => window.open(image.url, '_blank')}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Descarcă
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Informații despre comprimare */}
          <div className="mt-6 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
            <p><strong>Informații tehnice:</strong></p>
            <ul className="list-disc list-inside mt-1 space-y-1 text-xs">
              <li>Imaginile au fost comprimate automat pentru optimizarea stocării</li>
              <li>Calitatea a fost păstrată pentru identificarea clară a defectelor</li>
              <li>Maxim 3 imagini pot fi încărcate per lucrare</li>
              <li>Click pe imagine pentru mărire, buton pentru deschidere în tab nou</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Dialog pentru vizualizarea imaginii mărite */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Imagine defect - Vizualizare mărită</DialogTitle>
          </DialogHeader>
          {selectedImage && (
            <div className="flex justify-center">
              <img
                src={selectedImage}
                alt="Defect mărit"
                className="max-w-full max-h-[70vh] object-contain rounded-lg"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
} 