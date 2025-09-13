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

  const formatRoDateTime = (isoString: string) => {
    const d = new Date(isoString)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${dd}-${mm}-${yyyy} ${hh}:${min}`
  }
  const formatRoDate = (isoString: string) => {
    const d = new Date(isoString)
    const dd = String(d.getDate()).padStart(2, '0')
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const yyyy = d.getFullYear()
    return `${dd}-${mm}-${yyyy}`
  }
  const formatRoTime = (isoString: string) => {
    const d = new Date(isoString)
    const hh = String(d.getHours()).padStart(2, '0')
    const min = String(d.getMinutes()).padStart(2, '0')
    return `${hh}:${min}`
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
            Imagini încărcate de tehnician cu defectele identificate ({imaginiDefecte.length} imagini)
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
                  
                  </div>
                  
                  <div className="text-xs text-gray-500 space-y-1">
                    <p><strong>Data:</strong> {formatRoDate(image.uploadedAt)} <span className="mx-1">•</span> <strong>Ora:</strong> {formatRoTime(image.uploadedAt)}</p>
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

        
        </CardContent>
      </Card>

      {/* Dialog pentru vizualizarea imaginii mărite */}
      <Dialog open={!!selectedImage} onOpenChange={() => setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          {/* <DialogHeader>
            <DialogTitle>Imagine defect - Vizualizare mărită</DialogTitle>
          </DialogHeader> */}
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