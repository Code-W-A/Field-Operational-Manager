"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Camera, Download, ExternalLink, Loader2, Share2 } from "lucide-react"
import { useCallback, useState } from "react"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { useToast } from "@/hooks/use-toast"

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

type DefectImageRow = NonNullable<ImageDefectViewerProps["imaginiDefecte"]>[number]

function safeFileName(name: string, fallback: string) {
  const base = name?.trim() || fallback
  return base.replace(/[^\w.\- \u00C0-\u024f]+/gi, "_").slice(0, 200) || fallback
}

export function ImageDefectViewer({ imaginiDefecte, userRole }: ImageDefectViewerProps) {
  const { toast } = useToast()
  const [selectedImage, setSelectedImage] = useState<DefectImageRow | null>(null)
  const [sharingUrl, setSharingUrl] = useState<string | null>(null)

  const shareDefectImage = useCallback(
    async (image: DefectImageRow) => {
      const fileLabel = safeFileName(image.fileName, "defect.jpg")
      setSharingUrl(image.url)
      try {
        let file: File | null = null
        try {
          const res = await fetch(image.url, { mode: "cors", credentials: "omit" })
          if (res.ok) {
            const blob = await res.blob()
            const type =
              blob.type && blob.type.startsWith("image/") ? blob.type : "image/jpeg"
            file = new File([blob], fileLabel, { type })
          }
        } catch {
          file = null
        }

        if (file && typeof navigator !== "undefined" && navigator.share) {
          const payload: ShareData = { title: "Imagine defect", text: fileLabel }
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ ...payload, files: [file] })
            return
          }
        }

        if (typeof navigator !== "undefined" && navigator.share) {
          try {
            await navigator.share({
              title: "Imagine defect",
              text: fileLabel,
              url: image.url,
            })
            return
          } catch (e: unknown) {
            if ((e as { name?: string })?.name === "AbortError") return
          }
        }

        const a = document.createElement("a")
        a.href = image.url
        a.download = fileLabel
        a.target = "_blank"
        a.rel = "noopener noreferrer"
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        toast({
          title: "Descărcare",
          description:
            "Partajarea directă nu e disponibilă în acest browser. Am pornit descărcarea fișierului.",
        })
      } catch (e: unknown) {
        console.error("share defect image", e)
        toast({
          title: "Nu s-a putut partaja",
          description: e instanceof Error ? e.message : "Încearcă din nou sau folosește Descarcă.",
          variant: "destructive",
        })
      } finally {
        setSharingUrl(null)
      }
    },
    [toast],
  )

  // Nu afișăm componenta pentru tehnicieni sau dacă nu sunt imagini
  if (userRole === "tehnician" || !imaginiDefecte || imaginiDefecte.length === 0) {
    return null
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
              <div key={image.url || `img-${index}`} className="space-y-2">
                <div
                  className="aspect-video relative rounded-lg overflow-hidden border bg-gray-100 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.url}
                    alt={`Defect ${index + 1}`}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute top-2 right-2 flex gap-1">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 w-8 p-0"
                      title="Partajează"
                      disabled={sharingUrl === image.url}
                      onClick={(e) => {
                        e.stopPropagation()
                        void shareDefectImage(image)
                      }}
                    >
                      {sharingUrl === image.url ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Share2 className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-8 w-8 p-0"
                      title="Deschide în filă nouă"
                      onClick={(e) => {
                        e.stopPropagation()
                        window.open(image.url, "_blank")
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
                    <p>
                      <strong>Data:</strong> {formatRoDate(image.uploadedAt)}{" "}
                      <span className="mx-1">•</span> <strong>Ora:</strong> {formatRoTime(image.uploadedAt)}
                    </p>
                  </div>

                  <div className="mt-2 flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      onClick={() => window.open(image.url, "_blank")}
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Descarcă
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-1"
                      disabled={sharingUrl === image.url}
                      onClick={() => void shareDefectImage(image)}
                    >
                      {sharingUrl === image.url ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Share2 className="mr-2 h-4 w-4" />
                      )}
                      Partajează
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>

        
        </CardContent>
      </Card>

      {/* Dialog pentru vizualizarea imaginii mărite */}
      <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
          {selectedImage && (
            <>
              <div className="flex justify-center">
                <img
                  src={selectedImage.url}
                  alt="Defect mărit"
                  className="max-h-[70vh] max-w-full rounded-lg object-contain"
                />
              </div>
              <div className="flex flex-wrap justify-end gap-2 border-t pt-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void shareDefectImage(selectedImage)}
                  disabled={sharingUrl === selectedImage.url}
                >
                  {sharingUrl === selectedImage.url ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Share2 className="mr-2 h-4 w-4" />
                  )}
                  Partajează
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href={selectedImage.url} download={safeFileName(selectedImage.fileName, "defect.jpg")}>
                    <Download className="mr-2 h-4 w-4" />
                    Descarcă
                  </a>
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
} 