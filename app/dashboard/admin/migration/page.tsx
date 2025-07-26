"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, CheckCircle, Database, Play, RotateCcw } from "lucide-react"
import { migrateClientData, checkClientDataIntegrity } from "@/lib/utils/client-migration"
import { useAuth } from "@/contexts/AuthContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

interface MigrationStats {
  total: number
  withTelefon: number
  withReprezentant: number
  missingTelefon: string[]
  missingReprezentant: string[]
}

interface MigrationResult {
  totalClients: number
  migratedClients: number
  errors: string[]
  details: string[]
}

export default function MigrationPage() {
  const { userData } = useAuth()
  const [isLoading, setIsLoading] = useState(false)
  const [migrationResult, setMigrationResult] = useState<MigrationResult | null>(null)
  const [integrityStats, setIntegrityStats] = useState<MigrationStats | null>(null)
  const [lastCheck, setLastCheck] = useState<Date | null>(null)

  // Verificăm dacă utilizatorul este admin
  if (!userData || userData.role !== "admin") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center text-red-600">Acces Interzis</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-center text-muted-foreground">
              Această pagină este disponibilă doar pentru administratori.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleCheckIntegrity = async () => {
    setIsLoading(true)
    try {
      const stats = await checkClientDataIntegrity()
      setIntegrityStats(stats)
      setLastCheck(new Date())
    } catch (error) {
      console.error("Eroare la verificarea integrității:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleRunMigration = async () => {
    setIsLoading(true)
    try {
      const result = await migrateClientData()
      setMigrationResult(result)
      
      // Actualizăm și statisticile după migrare
      const stats = await checkClientDataIntegrity()
      setIntegrityStats(stats)
      setLastCheck(new Date())
    } catch (error) {
      console.error("Eroare la rularea migrației:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center space-x-2">
        <Database className="h-6 w-6" />
        <h1 className="text-2xl font-bold">Migrarea Datelor Clienți</h1>
      </div>

      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Importantă</AlertTitle>
        <AlertDescription>
          Această pagină permite migrarea datelor pentru a adăuga câmpurile <strong>telefon</strong> și{" "}
          <strong>reprezentantFirma</strong> la clienții existenți care nu le au. Rulează doar ca administrator.
        </AlertDescription>
      </Alert>

      {/* Card pentru verificarea integrității */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <CheckCircle className="h-5 w-5" />
            <span>Verificare Integritate Date</span>
          </CardTitle>
          <CardDescription>
            Verifică câți clienți au câmpurile telefon și reprezentantFirma completate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Button onClick={handleCheckIntegrity} disabled={isLoading} className="w-full">
            {isLoading ? "Se verifică..." : "Verifică Integritatea Datelor"}
          </Button>

          {integrityStats && (
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Total clienți:</span>
                <Badge variant="outline">{integrityStats.total}</Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Cu telefon:</span>
                <Badge variant={integrityStats.withTelefon === integrityStats.total ? "default" : "destructive"}>
                  {integrityStats.withTelefon}/{integrityStats.total}
                </Badge>
              </div>

              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Cu reprezentant:</span>
                <Badge variant={integrityStats.withReprezentant === integrityStats.total ? "default" : "destructive"}>
                  {integrityStats.withReprezentant}/{integrityStats.total}
                </Badge>
              </div>

              {integrityStats.missingTelefon.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-red-600">
                    Lipsește telefonul la {integrityStats.missingTelefon.length} clienți:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {integrityStats.missingTelefon.map((nume, index) => (
                      <Badge key={index} variant="destructive" className="text-xs">
                        {nume}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {integrityStats.missingReprezentant.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-red-600">
                    Lipsește reprezentantul la {integrityStats.missingReprezentant.length} clienți:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {integrityStats.missingReprezentant.map((nume, index) => (
                      <Badge key={index} variant="destructive" className="text-xs">
                        {nume}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {lastCheck && (
                <p className="text-xs text-muted-foreground">
                  Ultima verificare: {lastCheck.toLocaleString("ro-RO")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Card pentru migrare */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Play className="h-5 w-5" />
            <span>Rulare Migrare</span>
          </CardTitle>
          <CardDescription>
            Adaugă câmpurile telefon și reprezentantFirma la clienții care nu le au
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <RotateCcw className="h-4 w-4" />
            <AlertTitle>Cum funcționează migrarea</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>• Pentru <strong>telefon</strong>: caută în prima locație → prima persoană de contact</p>
              <p>• Pentru <strong>reprezentantFirma</strong>: caută în prima locație → prima persoană de contact</p>
              <p>• Dacă nu găsește, pune valoare goală ""</p>
            </AlertDescription>
          </Alert>

          <Button onClick={handleRunMigration} disabled={isLoading} className="w-full" variant="destructive">
            {isLoading ? "Se rulează migrarea..." : "Rulează Migrarea"}
          </Button>

          {migrationResult && (
            <div className="space-y-3">
              <Separator />
              <h3 className="font-medium">Rezultatul Migrării</h3>

              <div className="grid grid-cols-2 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{migrationResult.totalClients}</div>
                  <div className="text-sm text-muted-foreground">Total clienți</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{migrationResult.migratedClients}</div>
                  <div className="text-sm text-muted-foreground">Clienți migrați</div>
                </div>
              </div>

              {migrationResult.errors.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium text-red-600">Erori:</span>
                  <div className="space-y-1">
                    {migrationResult.errors.map((error, index) => (
                      <p key={index} className="text-xs text-red-600 bg-red-50 p-2 rounded">
                        {error}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {migrationResult.details.length > 0 && (
                <div className="space-y-2">
                  <span className="text-sm font-medium">Detalii:</span>
                  <div className="max-h-40 overflow-y-auto space-y-1">
                    {migrationResult.details.map((detail, index) => (
                      <p key={index} className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                        {detail}
                      </p>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
} 