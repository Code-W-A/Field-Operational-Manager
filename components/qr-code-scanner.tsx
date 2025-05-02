"use client"

import { useState, useEffect } from "react"
import { QrReader } from "react-qr-reader"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/use-toast"

interface QRCodeScannerProps {
  expectedEquipmentCode?: string
  expectedLocationName?: string
  expectedClientName?: string
  onScanSuccess?: (data: any) => void
  onScanError?: (error: string) => void
  onVerificationComplete?: (success: boolean) => void
}

export function QRCodeScanner({
  expectedEquipmentCode,
  expectedLocationName,
  expectedClientName,
  onScanSuccess,
  onScanError,
  onVerificationComplete,
}: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    message: string
    details?: string[]
  } | null>(null)
  const { toast } = useToast()
  const [debugMode, setDebugMode] = useState(false)

  // Resetăm starea când se deschide/închide dialogul
  useEffect(() => {
    if (!isOpen) {
      setScanResult(null)
      setScanError(null)
      setVerificationResult(null)
      setIsVerifying(false)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen) {
      // Check if camera permissions are available
      navigator.mediaDevices
        .getUserMedia({ video: { facingMode: "environment" } })
        .then(() => {
          setScanError(null)
        })
        .catch((err) => {
          console.error("Camera permission error:", err)
          setScanError("Nu s-a putut accesa camera. Verificați permisiunile browserului.")
        })
    }
  }, [isOpen])

  // Funcție pentru verificarea datelor scanate
  const verifyScannedData = (data: any) => {
    setIsVerifying(true)
    setScanError(null)

    try {
      // If data is a string, try to parse it as JSON
      const parsedData = typeof data === "string" ? JSON.parse(data) : data
      console.log("Processing QR data:", parsedData)

      // Handle raw text QR codes
      if (parsedData.type === "unknown") {
        setVerificationResult({
          success: false,
          message: "QR code necunoscut",
          details: ["Acest QR code nu conține informații despre un echipament. Conținut: " + parsedData.raw],
        })
        if (onScanError) onScanError("QR code necunoscut")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        return
      }

      // Verificăm dacă este un QR code de echipament
      if (parsedData.type !== "equipment") {
        setVerificationResult({
          success: false,
          message: "QR code invalid",
          details: ["Acest QR code nu este pentru un echipament."],
        })
        if (onScanError) onScanError("QR code invalid")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        return
      }

      // Verificăm codul echipamentului
      const errors: string[] = []
      let isMatch = true

      if (expectedEquipmentCode && parsedData.code !== expectedEquipmentCode) {
        errors.push(`Cod echipament necorespunzător. Așteptat: ${expectedEquipmentCode}, Scanat: ${parsedData.code}`)
        isMatch = false
      }

      // Verificăm numele locației
      if (expectedLocationName && parsedData.location !== expectedLocationName) {
        errors.push(`Locație necorespunzătoare. Așteptat: ${expectedLocationName}, Scanat: ${parsedData.location}`)
        isMatch = false
      }

      // Verificăm numele clientului
      if (expectedClientName && parsedData.client !== expectedClientName) {
        errors.push(`Client necorespunzător. Așteptat: ${expectedClientName}, Scanat: ${parsedData.client}`)
        isMatch = false
      }

      // Setăm rezultatul verificării
      if (isMatch) {
        setVerificationResult({
          success: true,
          message: "Verificare reușită!",
          details: ["Echipamentul scanat corespunde cu lucrarea."],
        })
        if (onScanSuccess) onScanSuccess(parsedData)
        if (onVerificationComplete) onVerificationComplete(true)

        // Închide dialogul automat după o verificare reușită
        setTimeout(() => {
          setIsOpen(false)
          toast({
            title: "Verificare reușită",
            description: "Echipamentul scanat corespunde cu lucrarea. Puteți continua intervenția.",
          })
        }, 2000)
      } else {
        setVerificationResult({
          success: false,
          message: "Verificare eșuată!",
          details: errors,
        })
        if (onScanError) onScanError(errors.join(", "))
        if (onVerificationComplete) onVerificationComplete(false)
      }
    } catch (error) {
      console.error("Eroare la verificarea datelor scanate:", error)
      setVerificationResult({
        success: false,
        message: "Eroare la procesarea QR code-ului",
        details: ["Formatul QR code-ului nu este valid."],
      })
      if (onScanError) onScanError("Format QR code invalid")
      if (onVerificationComplete) onVerificationComplete(false)
    }

    setIsVerifying(false)
  }

  const handleScan = (result: any) => {
    if (result?.text) {
      console.log("QR Code detected:", result.text)
      setScanResult(result.text)

      try {
        // Try to parse the result as JSON
        let parsedData
        try {
          parsedData = JSON.parse(result.text)
          console.log("Successfully parsed QR data:", parsedData)
        } catch (parseError) {
          console.log("QR code is not valid JSON, using as raw text:", result.text)
          parsedData = { raw: result.text, type: "unknown" }
        }

        verifyScannedData(parsedData)
      } catch (error) {
        console.error("Error processing scan result:", error)
        setScanError(`Eroare la procesarea rezultatului: ${error.message}`)
      }
    }
  }

  const handleError = (error: any) => {
    console.error("Eroare la scanarea QR code-ului:", error)
    setScanError("A apărut o eroare la scanarea QR code-ului. Verificați permisiunile camerei.")
    if (onScanError) onScanError("Eroare la scanare")
    if (onVerificationComplete) onVerificationComplete(false)
  }

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        Scanează QR Code
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Scanare QR Code Echipament</DialogTitle>
            <DialogDescription>Îndreptați camera către QR code-ul echipamentului pentru a-l scana.</DialogDescription>
          </DialogHeader>

          {!scanResult && !scanError && (
            <>
              <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-lg">
                <QrReader
                  constraints={{
                    facingMode: "environment",
                    aspectRatio: 1,
                    width: { min: 640, ideal: 1280, max: 1920 },
                    height: { min: 480, ideal: 720, max: 1080 },
                  }}
                  onResult={handleScan}
                  scanDelay={300}
                  videoId="qr-video-element"
                  className="w-full h-full"
                  videoStyle={{ width: "100%", height: "100%", objectFit: "cover" }}
                  videoContainerStyle={{ width: "100%", height: "100%", position: "relative" }}
                  containerStyle={{ width: "100%", height: "100%", position: "relative" }}
                />
                <div className="absolute inset-0 border-2 border-dashed border-white pointer-events-none"></div>
              </div>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Dacă camera nu se afișează, verificați permisiunile browserului și reîncărcați pagina.
              </p>
            </>
          )}

          {scanError && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Eroare</AlertTitle>
              <AlertDescription>{scanError}</AlertDescription>
            </Alert>
          )}

          {isVerifying && (
            <div className="flex flex-col items-center justify-center p-4">
              <Spinner className="h-8 w-8" />
              <p className="mt-2">Se verifică echipamentul...</p>
            </div>
          )}

          {verificationResult && (
            <Alert variant={verificationResult.success ? "default" : "destructive"}>
              {verificationResult.success ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
              <AlertTitle>{verificationResult.message}</AlertTitle>
              <AlertDescription>
                <ul className="list-disc pl-5 mt-2">
                  {verificationResult.details?.map((detail, index) => (
                    <li key={index}>{detail}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {debugMode && (
            <div className="bg-muted p-2 rounded text-xs overflow-auto max-h-32">
              <p className="font-bold">Debug Info:</p>
              <p>Scan Result: {scanResult ? scanResult.substring(0, 100) + "..." : "None"}</p>
              <p>Error: {scanError || "None"}</p>
              <p>
                Verification:{" "}
                {verificationResult ? JSON.stringify(verificationResult).substring(0, 100) + "..." : "None"}
              </p>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Închide
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDebugMode(!debugMode)} className="text-xs">
              {debugMode ? "Dezactivează Debug" : "Activează Debug"}
            </Button>
            {/* Am eliminat butonul "Continuă oricum" */}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
