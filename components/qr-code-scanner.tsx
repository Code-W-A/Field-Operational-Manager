"use client"

import { useState, useEffect, useRef } from "react"
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
import { AlertCircle, CheckCircle2, XCircle, Camera, KeyRound, Flashlight, RotateCcw } from "lucide-react"
import { Spinner } from "@/components/ui/spinner"
import { useToast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import * as z from "zod"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { calculateWarranty, getWarrantyDisplayInfo } from "@/lib/utils/warranty-calculator"
import type { Echipament } from "@/lib/firebase/firestore"

interface QRCodeScannerProps {
  expectedEquipmentCode?: string
  expectedLocationName?: string
  expectedClientName?: string
  onScanSuccess?: (data: any) => void
  onScanError?: (error: string) => void
  onVerificationComplete?: (success: boolean) => void
  isWarrantyWork?: boolean
  onWarrantyVerification?: (isInWarranty: boolean) => void
  equipmentData?: Echipament
}

// Schema pentru validarea codului introdus manual
const manualCodeSchema = z.object({
  equipmentCode: z.string().min(1, "Codul echipamentului este obligatoriu"),
})

type ManualCodeFormValues = z.infer<typeof manualCodeSchema>

// Constantă pentru timeout-ul de scanare (20 secunde)
const SCAN_TIMEOUT_MS = 20000

export function QRCodeScanner({
  expectedEquipmentCode,
  expectedLocationName,
  expectedClientName,
  onScanSuccess,
  onScanError,
  onVerificationComplete,
  isWarrantyWork,
  onWarrantyVerification,
  equipmentData,
}: QRCodeScannerProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [scanResult, setScanResult] = useState<any>(null)
  const [scanError, setScanError] = useState<string | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [isScanning, setIsScanning] = useState(false)
  const [verificationResult, setVerificationResult] = useState<{
    success: boolean
    message: string
    details?: string[]
  } | null>(null)
  const { toast } = useToast()
  const [isMobile, setIsMobile] = useState(false)
  const [cameraPermissionStatus, setCameraPermissionStatus] = useState<"prompt" | "granted" | "denied" | "unknown">("unknown")

  // State pentru introducerea manuală
  const [failedScanAttempts, setFailedScanAttempts] = useState(0)
  const [showManualEntryButton, setShowManualEntryButton] = useState(false)
  const [showManualCodeInput, setShowManualCodeInput] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState(SCAN_TIMEOUT_MS / 1000)
  const [isTimeoutActive, setIsTimeoutActive] = useState(false)
  
  // Refs pentru timeout-uri
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const timeDisplayRef = useRef<NodeJS.Timeout | null>(null)

  // State pentru funcționalitatea de garanție
  const [warrantyInfo, setWarrantyInfo] = useState<any>(null)
  const [showWarrantyVerification, setShowWarrantyVerification] = useState(false)
  const [technicianWarrantyDeclaration, setTechnicianWarrantyDeclaration] = useState<boolean | null>(null)

  // State pentru controale simple cameră
  const [torchEnabled, setTorchEnabled] = useState(false)
  const [videoTrack, setVideoTrack] = useState<MediaStreamTrack | null>(null)
  const [supportsTorch, setSupportsTorch] = useState(false)
  const [facingMode, setFacingMode] = useState<"environment" | "user">("environment")

  // Inițializăm formularul pentru introducerea manuală
  const form = useForm<ManualCodeFormValues>({
    resolver: zodResolver(manualCodeSchema),
    defaultValues: {
      equipmentCode: "",
    },
  })

  // Detectăm dacă suntem pe un dispozitiv mobil
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor || (window as any).opera
      const mobileRegex = /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i
      const isMobileDevice = mobileRegex.test(userAgent.toLowerCase())
      setIsMobile(isMobileDevice)
      // Pe desktop, începem cu camera frontală
      setFacingMode(isMobileDevice ? "environment" : "user")
    }
    checkMobile()
  }, [])

  // Resetăm starea când se deschide/închide dialogul
  useEffect(() => {
    if (!isOpen) {
      // Reset toate state-urile
      setScanResult(null)
      setScanError(null)
      setVerificationResult(null)
      setIsVerifying(false)
      setIsScanning(false)
      setFailedScanAttempts(0)
      setShowManualEntryButton(false)
      setShowManualCodeInput(false)
      setTimeRemaining(SCAN_TIMEOUT_MS / 1000)
      setIsTimeoutActive(false)
      setWarrantyInfo(null)
      setShowWarrantyVerification(false)
      setTechnicianWarrantyDeclaration(null)
      setTorchEnabled(false)
      setVideoTrack(null)
      setSupportsTorch(false)
      form.reset()

      // Curățăm timeout-urile
      clearAllTimeouts()
    } else {
      // Când se deschide dialogul
      checkCameraPermissions()
      setIsScanning(true)
      setFailedScanAttempts(0)
      setIsTimeoutActive(true)
      startScanTimeout()
    }
  }, [isOpen])

  // Funcție pentru curățarea tuturor timeout-urilor
  const clearAllTimeouts = () => {
    if (scanTimeoutRef.current) {
      clearTimeout(scanTimeoutRef.current)
      scanTimeoutRef.current = null
    }
    if (timeDisplayRef.current) {
      clearTimeout(timeDisplayRef.current)
      timeDisplayRef.current = null
    }
  }

  // Funcție pentru pornirea timeout-ului de scanare
  const startScanTimeout = () => {
    setTimeRemaining(SCAN_TIMEOUT_MS / 1000)
    setIsTimeoutActive(true)

    // Timeout pentru afișarea butonului de introducere manuală
    scanTimeoutRef.current = setTimeout(() => {
      if (isScanning && !showManualCodeInput) {
        console.log("Timeout de scanare atins - afișez butonul de introducere manuală")
        setShowManualEntryButton(true)
        setIsTimeoutActive(false)
      }
    }, SCAN_TIMEOUT_MS)

    // Timer pentru afișarea timpului rămas
    const startTime = Date.now()
    const updateTimer = () => {
      const elapsed = Date.now() - startTime
      const remaining = Math.max(0, (SCAN_TIMEOUT_MS - elapsed) / 1000)
      setTimeRemaining(Math.ceil(remaining))

      if (remaining > 0 && isTimeoutActive) {
        timeDisplayRef.current = setTimeout(updateTimer, 1000)
      }
    }
    updateTimer()
  }

  // Verificăm permisiunile camerei cu setări simple și optimizate
  const checkCameraPermissions = async () => {
    try {
      // Constraints compatibile cu majoritatea dispozitivelor
      const constraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1280, min: 640, max: 1920 },
          height: { ideal: 720, min: 480, max: 1080 },
          frameRate: { ideal: 30 },
        },
      }

      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      
      // Verificăm suportul pentru torch
      const track = stream.getVideoTracks()[0]
      if (track) {
        setVideoTrack(track)
        const capabilities = track.getCapabilities() as any
        
        if (capabilities.torch) {
          setSupportsTorch(true)
          console.log("Camera suportă torch/flash")
        }
      }

      // Eliberăm stream-ul după verificare
      stream.getTracks().forEach((track) => track.stop())
      setCameraPermissionStatus("granted")
      setScanError(null)
    } catch (err) {
      console.error("Camera permission error:", err)
      setScanError("Nu s-a putut accesa camera. Verificați permisiunile browserului.")
      setCameraPermissionStatus("denied")
      setIsScanning(false)
      incrementFailedAttempts()
    }
  }

  // Funcție simplă pentru controlul torch-ului
  const toggleTorch = async () => {
    if (!videoTrack || !supportsTorch) return
    
    try {
      await videoTrack.applyConstraints({
        advanced: [{ torch: !torchEnabled } as any]
      })
      setTorchEnabled(!torchEnabled)
      console.log(`Torch ${!torchEnabled ? 'activat' : 'dezactivat'}`)
    } catch (err) {
      console.error("Eroare la controlul torch:", err)
    }
  }

  // Funcție pentru comutarea camerei (față/spate)
  const switchCamera = () => {
    const newFacingMode = facingMode === "environment" ? "user" : "environment"
    setFacingMode(newFacingMode)
    
    // Restart scanarea cu noua cameră
    setIsScanning(false)
    setTimeout(() => {
      setIsScanning(true)
      checkCameraPermissions()
    }, 500)
  }

  // Funcție pentru incrementarea contorului de încercări eșuate
  const incrementFailedAttempts = () => {
    setFailedScanAttempts((prev) => {
      const newCount = prev + 1
      console.log(`Încercare eșuată ${newCount}`)

      // După 2 încercări eșuate consecutive, afișăm butonul de introducere manuală
      if (newCount >= 2) {
        setShowManualEntryButton(true)
        setIsTimeoutActive(false)
        clearAllTimeouts()
      }

      return newCount
    })
  }

  // Funcție pentru verificarea datelor scanate (păstrată identică cu logica originală)
  const verifyScannedData = (data: any) => {
    setIsVerifying(true)
    setIsScanning(false)
    setScanError(null)
    clearAllTimeouts()
    setIsTimeoutActive(false)

    try {
      let parsedData
      try {
        parsedData = typeof data === "string" ? JSON.parse(data) : data
        console.log("Processing QR data:", parsedData)
      } catch (parseError) {
        console.log("QR code is not valid JSON, using as raw text:", data)
        parsedData = { raw: data, type: "unknown" }
      }

      if (parsedData.type === "unknown") {
        setVerificationResult({
          success: false,
          message: "QR code necunoscut",
          details: ["Acest QR code nu conține informații despre un echipament. Conținut: " + parsedData.raw],
        })
        if (onScanError) onScanError("QR code necunoscut")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        restartScanning()
        return
      }

      if (parsedData.type !== "equipment") {
        setVerificationResult({
          success: false,
          message: "QR code invalid",
          details: ["Acest QR code nu este pentru un echipament."],
        })
        if (onScanError) onScanError("QR code invalid")
        if (onVerificationComplete) onVerificationComplete(false)
        setIsVerifying(false)
        restartScanning()
        return
      }

      // Verificăm codul echipamentului (compatibil cu ambele formate: vechi și nou)
      const errors: string[] = []
      let isMatch = true

      // Verificare obligatorie: codul echipamentului
      if (expectedEquipmentCode && parsedData.code !== expectedEquipmentCode) {
        errors.push(`Cod echipament necorespunzător`)
        isMatch = false
      }

      // Verificări opționale pentru compatibilitate cu QR-urile vechi și noi
      if (expectedLocationName && parsedData.location && parsedData.location !== expectedLocationName) {
        errors.push(`Locație necorespunzătoare`)
        isMatch = false
      }

      if (expectedClientName && parsedData.client && parsedData.client !== expectedClientName) {
        errors.push(`Client necorespunzător`)
        isMatch = false
      }

      // Log pentru debugging - să vedem ce format de QR code scanăm
      console.log("🔍 QR Code Format:", {
        hasId: !!parsedData.id,
        hasName: !!parsedData.name,
        hasClient: !!parsedData.client,
        hasLocation: !!parsedData.location,
        format: parsedData.id && parsedData.name ? "VECHI (complet)" : "NOU (simplificat)"
      })

      if (isMatch) {
        setVerificationResult({
          success: true,
          message: "Verificare reușită!",
          details: ["Echipamentul scanat corespunde cu lucrarea."],
        })
        
        // Verificăm garanția pentru lucrări de tip "Intervenție în garanție"
        if (isWarrantyWork && equipmentData) {
          const warranty = getWarrantyDisplayInfo(equipmentData)
          setWarrantyInfo(warranty)
          setShowWarrantyVerification(true)
        } else {
          // Pentru alte tipuri de lucrări, chemăm callback-urile direct
          if (onScanSuccess) onScanSuccess(parsedData)
          if (onVerificationComplete) onVerificationComplete(true)

          setFailedScanAttempts(0)
          setShowManualEntryButton(false)

          setTimeout(() => {
            setIsOpen(false)
            toast({
              title: "Verificare reușită",
              description: "Echipamentul scanat corespunde cu lucrarea. Puteți continua intervenția.",
            })
          }, 2000)
        }
      } else {
        setVerificationResult({
          success: false,
          message: "Verificare eșuată!",
          details: errors,
        })
        if (onScanError) onScanError(errors.join(", "))
        if (onVerificationComplete) onVerificationComplete(false)
        restartScanning()
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
      restartScanning()
    }

    setIsVerifying(false)
  }

  // Funcție pentru restart scanare după eroare
  const restartScanning = () => {
    incrementFailedAttempts()
    setTimeout(() => {
      if (!showManualCodeInput && !showWarrantyVerification) {
        setIsScanning(true)
        if (failedScanAttempts < 2) {
          startScanTimeout()
        }
      }
    }, 1000)
  }

  // Funcție pentru activarea introducerii manuale
  const activateManualCodeInput = () => {
    setShowManualCodeInput(true)
    setIsScanning(false)
    setIsTimeoutActive(false)
    clearAllTimeouts()
  }

  // Funcție pentru întoarcerea la scanare
  const returnToScanning = () => {
    setShowManualCodeInput(false)
    setShowManualEntryButton(false)
    setFailedScanAttempts(0)
    setScanResult(null)
    setScanError(null)
    setVerificationResult(null)
    setIsScanning(true)
    setIsTimeoutActive(true)
    form.reset()
    startScanTimeout()
  }

  // Handler pentru scanare
  const handleScan = (result: any) => {
    if (result?.text && isScanning) {
      console.log("QR Code detectat:", result.text)
      setScanResult(result.text)
      setIsScanning(false)
      setIsTimeoutActive(false)
      clearAllTimeouts()
      verifyScannedData(result.text)
    }
  }

  // Handler pentru erori de scanare
  const handleError = (error: any) => {
    console.error("Eroare la scanarea QR code-ului:", error)
    setScanError("A apărut o eroare la scanarea QR code-ului. Verificați permisiunile camerei.")
    setIsScanning(false)
    if (onScanError) onScanError("Eroare la scanare")
    if (onVerificationComplete) onVerificationComplete(false)
    incrementFailedAttempts()
  }

  // Funcție pentru verificarea codului introdus manual (păstrată identică)
  const onSubmitManualCode = (values: ManualCodeFormValues) => {
    console.log("Verificare cod manual:", values.equipmentCode)
    setIsVerifying(true)

    const manualData = {
      type: "equipment",
      code: values.equipmentCode,
      client: expectedClientName || "",
      location: expectedLocationName || "",
    }

    if (expectedEquipmentCode && values.equipmentCode === expectedEquipmentCode) {
      setVerificationResult({
        success: true,
        message: "Verificare reușită!",
        details: ["Codul introdus manual corespunde cu echipamentul din lucrare."],
      })

      if (onScanSuccess) onScanSuccess(manualData)
      if (onVerificationComplete) onVerificationComplete(true)

      setTimeout(() => {
        setIsOpen(false)
        toast({
          title: "Verificare reușită",
          description: "Codul introdus manual corespunde cu echipamentul din lucrare. Puteți continua intervenția.",
        })
      }, 2000)
    } else {
      setVerificationResult({
        success: false,
        message: "Verificare eșuată!",
        details: [`Cod echipament necorespunzător`],
      })

      if (onScanError) onScanError(`Cod echipament necorespunzător`)
      if (onVerificationComplete) onVerificationComplete(false)
    }

    setIsVerifying(false)
  }

  // Funcție pentru gestionarea declarației tehnicianului despre garanție (păstrată identică)
  const handleWarrantyDeclaration = (isInWarranty: boolean) => {
    setTechnicianWarrantyDeclaration(isInWarranty)
    
    if (onWarrantyVerification) {
      onWarrantyVerification(isInWarranty)
    }
    
    if (onScanSuccess && scanResult) {
      onScanSuccess(scanResult)
    }
    if (onVerificationComplete) {
      onVerificationComplete(true)
    }

    setFailedScanAttempts(0)
    setShowManualEntryButton(false)

    setTimeout(() => {
      setIsOpen(false)
      toast({
        title: "Verificare completă",
        description: `Echipamentul a fost verificat. Garanție: ${isInWarranty ? 'DA' : 'NU'}`,
      })
    }, 1500)
  }

  // Curățăm timeout-urile la dezmontarea componentei
  useEffect(() => {
    return () => {
      clearAllTimeouts()
    }
  }, [])

  return (
    <>
      <Button onClick={() => setIsOpen(true)} variant="outline">
        Scanează QR Code
      </Button>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Scanare QR Code Echipament</DialogTitle>
            <DialogDescription>
              Îndreptați camera către QR code-ul echipamentului pentru a-l scana.
            </DialogDescription>
          </DialogHeader>

          {/* Mesaj pentru permisiuni cameră */}
          {cameraPermissionStatus === "denied" && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Acces cameră blocat</AlertTitle>
              <AlertDescription>
                <p>Browserul a blocat accesul la cameră. Pentru a scana QR code-uri, trebuie să permiteți accesul la cameră.</p>
                <Button variant="outline" className="mt-2" onClick={checkCameraPermissions}>
                  <Camera className="mr-2 h-4 w-4" />
                  Încearcă din nou
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Scanner QR simplu și optimizat */}
          {isScanning && !showManualCodeInput && cameraPermissionStatus !== "denied" && (
            <div className="space-y-4">
              <div className="relative aspect-square w-full max-w-sm mx-auto overflow-hidden rounded-lg border-2 border-dashed border-blue-300">
                <QrReader
                  constraints={{
                    facingMode: facingMode,
                    width: { ideal: 1280, min: 640 },
                    height: { ideal: 720, min: 480 },
                    frameRate: { ideal: 30 },
                  }}
                  onResult={handleScan}
                  scanDelay={300}
                  className="w-full h-full"
                  videoStyle={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                />
                
                {/* Indicator de scanare */}
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="absolute top-2 right-2 flex items-center bg-black bg-opacity-70 text-white text-sm px-2 py-1 rounded-full">
                    <div className="w-2 h-2 bg-green-500 rounded-full mr-1 animate-pulse"></div>
                    <span>Scanare...</span>
                  </div>
                </div>
              </div>

              {/* Controale simple pentru cameră */}
              <div className="flex justify-center gap-2">
                {isMobile && (
                  <Button variant="outline" size="sm" onClick={switchCamera}>
                    <RotateCcw className="h-4 w-4 mr-1" />
                    {facingMode === "environment" ? "Cameră față" : "Cameră spate"}
                  </Button>
                )}
                
                {supportsTorch && (
                  <Button
                    variant={torchEnabled ? "default" : "outline"}
                    size="sm"
                    onClick={toggleTorch}
                  >
                    <Flashlight className="h-4 w-4 mr-1" />
                    {torchEnabled ? "Flash ON" : "Flash OFF"}
                  </Button>
                )}
              </div>

              <p className="text-sm text-muted-foreground text-center">
                Asigurați-vă că QR code-ul este în cadrul camerei și bine iluminat.
              </p>
            </div>
          )}

          {/* Buton pentru introducerea manuală */}
          {showManualEntryButton && !showManualCodeInput && (
            <div className="mt-4 p-4 border rounded-lg bg-muted/30">
              <p className="text-sm text-muted-foreground mb-3">
                {failedScanAttempts > 0 
                  ? `Nu s-a putut scana codul după ${failedScanAttempts} încercări. Încercați introducerea manuală.`
                  : "Timp expirat pentru scanare. Puteți introduce codul manual."
                }
              </p>
              <Button onClick={activateManualCodeInput} className="w-full">
                <KeyRound className="mr-2 h-4 w-4" />
                Introdu codul manual
              </Button>
            </div>
          )}

          {/* Formularul de introducere manuală (păstrat identic) */}
          {showManualCodeInput && (
            <div className="p-4 border rounded-lg mt-4">
              <h3 className="text-lg font-medium mb-2">Introducere manuală cod</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Introduceți codul unic al echipamentului pentru verificare.
              </p>

              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmitManualCode)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="equipmentCode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Cod echipament</FormLabel>
                        <FormControl>
                          <Input 
                            placeholder="Introduceți codul echipamentului" 
                            {...field}
                            onChange={(e) => {
                              const uppercaseValue = e.target.value.toUpperCase()
                              field.onChange(uppercaseValue)
                            }}
                            style={{ textTransform: 'uppercase' }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button type="submit" className="flex-1" disabled={isVerifying}>
                      {isVerifying ? (
                        <>
                          <Spinner className="mr-2 h-4 w-4" />
                          Se verifică...
                        </>
                      ) : (
                        <>
                          <KeyRound className="mr-2 h-4 w-4" />
                          Verifică codul
                        </>
                      )}
                    </Button>
                    <Button type="button" variant="outline" onClick={returnToScanning} className="flex-1">
                      <Camera className="mr-2 h-4 w-4" />
                      Reîncearcă scanarea
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          )}

          {/* Erori de scanare */}
          {scanError && cameraPermissionStatus !== "denied" && !showManualCodeInput && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Eroare</AlertTitle>
              <AlertDescription>{scanError}</AlertDescription>
            </Alert>
          )}

          {/* Indicator de verificare */}
          {isVerifying && !showManualCodeInput && (
            <div className="flex flex-col items-center justify-center p-4">
              <Spinner className="h-8 w-8" />
              <p className="mt-2">Se verifică echipamentul...</p>
            </div>
          )}

          {/* Rezultatul verificării */}
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

          {/* Secțiunea pentru verificarea garanției (păstrată identică) */}
          {showWarrantyVerification && verificationResult?.success && warrantyInfo && (
            <Card className="border-2 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-blue-900">
                  <div className="h-5 w-5 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-white text-xs font-bold">G</span>
                  </div>
                  Verificare Garanție Echipament
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 bg-white rounded-md border">
                  <h4 className="font-medium text-sm mb-2">Calculul automat al garanției:</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-600">Status:</span>
                      <Badge className={warrantyInfo.statusBadgeClass + " ml-1"}>
                        {warrantyInfo.statusText}
                      </Badge>
                    </div>
                    <div>
                      <span className="text-gray-600">Zile rămase:</span>
                      <span className={`ml-1 font-medium ${warrantyInfo.isInWarranty ? 'text-green-600' : 'text-red-600'}`}>
                        {warrantyInfo.isInWarranty ? warrantyInfo.daysRemaining : 0} zile
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-600">Data instalării:</span>
                      <span className="ml-1">{warrantyInfo.installationDate || "Nedefinită"}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Expiră la:</span>
                      <span className="ml-1">{warrantyInfo.warrantyExpires || "Nedefinită"}</span>
                    </div>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{warrantyInfo.warrantyMessage}</p>
                </div>

                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <h4 className="font-medium text-sm mb-3 text-yellow-800">
                    Declarație tehnician (după verificarea fizică):
                  </h4>
                  <p className="text-xs text-yellow-700 mb-3">
                    Pe baza verificării fizice a echipamentului, confirmați dacă acesta este sau nu în garanție:
                  </p>
                  
                  {technicianWarrantyDeclaration === null ? (
                    <div className="flex flex-col space-y-2">
                      <Button 
                        onClick={() => handleWarrantyDeclaration(true)}
                        className="bg-green-600 hover:bg-green-700 text-white"
                        size="sm"
                      >
                        ✓ DA - Echipamentul este în garanție
                      </Button>
                      <Button 
                        onClick={() => handleWarrantyDeclaration(false)}
                        variant="destructive"
                        size="sm"
                      >
                        ✗ NU - Echipamentul NU este în garanție
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Badge 
                        className={technicianWarrantyDeclaration 
                          ? "bg-green-100 text-green-800 border-green-200" 
                          : "bg-red-100 text-red-800 border-red-200"
                        }
                      >
                        {technicianWarrantyDeclaration ? "✓ În garanție" : "✗ Nu este în garanție"}
                      </Badge>
                      <span className="text-xs text-gray-600">Declarție confirmată</span>
                    </div>
                  )}
                </div>

                {technicianWarrantyDeclaration !== null && 
                 technicianWarrantyDeclaration !== warrantyInfo.isInWarranty && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md">
                    <div className="flex items-center space-x-2">
                      <AlertCircle className="h-4 w-4 text-amber-600" />
                      <span className="font-medium text-sm text-amber-800">Discrepanță detectată</span>
                    </div>
                    <p className="text-xs text-amber-700 mt-1">
                      Declarația tehnicianului ({technicianWarrantyDeclaration ? "în garanție" : "nu este în garanție"}) 
                      diferă de calculul automat ({warrantyInfo.isInWarranty ? "în garanție" : "nu este în garanție"}).
                      Declarația tehnicianului va fi folosită în raport.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsOpen(false)} className="w-full">
              Închide
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
