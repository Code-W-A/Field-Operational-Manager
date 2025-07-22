"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScrollArea } from "@/components/ui/scroll-area"
import { getLogs } from "@/lib/firebase/firestore"
import { Spinner } from "@/components/ui/spinner"
import { Badge } from "@/components/ui/badge"
import { Search, Download, RefreshCw } from "lucide-react"

interface LogEntry {
  id?: string
  timestamp: any
  utilizator: string
  utilizatorId?: string
  actiune: string
  detalii: string
  tip: string
  categorie: string
}

export function EmailLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [filteredLogs, setFilteredLogs] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [categoryFilter, setCategoryFilter] = useState("Email")
  const [typeFilter, setTypeFilter] = useState("")

  // Fetch logs on component mount
  useEffect(() => {
    fetchLogs()
  }, [])

  // Filter logs when filters change
  useEffect(() => {
    filterLogs()
  }, [logs, searchTerm, categoryFilter, typeFilter])

  const fetchLogs = async () => {
    setLoading(true)
    setError(null)

    try {
      const fetchedLogs = await getLogs()
      setLogs(fetchedLogs)
    } catch (err: any) {
      setError(`Eroare la încărcarea logurilor: ${err.message}`)
      console.error("Eroare la încărcarea logurilor:", err)
    } finally {
      setLoading(false)
    }
  }

  const filterLogs = () => {
    let filtered = [...logs]

    // Filter by category
    if (categoryFilter) {
      filtered = filtered.filter((log) => log.categorie === categoryFilter)
    }

    // Filter by type
    if (typeFilter) {
      filtered = filtered.filter((log) => log.tip === typeFilter)
    }

    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(
        (log) =>
          log.detalii.toLowerCase().includes(term) ||
          log.actiune.toLowerCase().includes(term) ||
          log.utilizator.toLowerCase().includes(term),
      )
    }

    setFilteredLogs(filtered)
  }

  const exportLogs = () => {
    const jsonString = JSON.stringify(filteredLogs, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const a = document.createElement("a")
    a.href = url
    a.download = `email-logs-${new Date().toISOString()}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const getBadgeColor = (type: string) => {
    switch (type) {
      case "Eroare":
        return "bg-red-500 hover:bg-red-600"
      case "Avertisment":
        return "bg-yellow-500 hover:bg-yellow-600"
      case "Informație":
        return "bg-blue-500 hover:bg-blue-600"
      default:
        return "bg-gray-500 hover:bg-gray-600"
    }
  }

  const formatTimestamp = (timestamp: any) => {
    if (!timestamp) return "N/A"

    try {
      // Handle Firestore Timestamp
      if (timestamp.toDate) {
        const date = timestamp.toDate()
        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()
        const hour = date.getHours().toString().padStart(2, "0")
        const minute = date.getMinutes().toString().padStart(2, "0")
        const second = date.getSeconds().toString().padStart(2, "0")
        return `${day}.${month}.${year} ${hour}:${minute}:${second}`
      }

      // Handle string ISO date
      if (typeof timestamp === "string") {
        const date = new Date(timestamp)
        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()
        const hour = date.getHours().toString().padStart(2, "0")
        const minute = date.getMinutes().toString().padStart(2, "0")
        const second = date.getSeconds().toString().padStart(2, "0")
        return `${day}.${month}.${year} ${hour}:${minute}:${second}`
      }

      // Handle seconds timestamp
      if (typeof timestamp === "number") {
        const date = new Date(timestamp * 1000)
        const day = date.getDate().toString().padStart(2, "0")
        const month = (date.getMonth() + 1).toString().padStart(2, "0")
        const year = date.getFullYear()
        const hour = date.getHours().toString().padStart(2, "0")
        const minute = date.getMinutes().toString().padStart(2, "0")
        const second = date.getSeconds().toString().padStart(2, "0")
        return `${day}.${month}.${year} ${hour}:${minute}:${second}`
      }

      return "Format necunoscut"
    } catch (err) {
      console.error("Eroare la formatarea timestamp-ului:", err)
      return "Eroare format"
    }
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>Vizualizare Loguri Email</span>
          <Button variant="outline" size="sm" onClick={fetchLogs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reîmprospătare
          </Button>
        </CardTitle>
        <CardDescription>
          Vizualizați și analizați logurile detaliate pentru diagnosticarea problemelor de email
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="flex flex-col space-y-4">
          {/* Filters */}
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <Label htmlFor="search">Căutare</Label>
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Căutare în loguri..."
                  className="pl-8"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="w-full md:w-1/4">
              <Label htmlFor="category">Categorie</Label>
              <select
                id="category"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">Toate categoriile</option>
                <option value="Email">Email</option>
                <option value="Api">API</option>
                <option value="Sistem">Sistem</option>
                <option value="Date">Date</option>
              </select>
            </div>

            <div className="w-full md:w-1/4">
              <Label htmlFor="type">Tip</Label>
              <select
                id="type"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
              >
                <option value="">Toate tipurile</option>
                <option value="Informație">Informație</option>
                <option value="Avertisment">Avertisment</option>
                <option value="Eroare">Eroare</option>
              </select>
            </div>
          </div>

          {/* Log display */}
          {loading ? (
            <div className="flex justify-center items-center py-8">
              <Spinner size="lg" />
            </div>
          ) : error ? (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{error}</div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Nu s-au găsit loguri care să corespundă criteriilor de filtrare.
            </div>
          ) : (
            <ScrollArea className="h-[500px] rounded-md border">
              <div className="p-4 space-y-4">
                {filteredLogs.map((log) => (
                  <div key={log.id} className="border rounded-lg p-4 bg-card">
                    <div className="flex justify-between items-start mb-2">
                      <div className="font-medium">{log.actiune}</div>
                      <Badge className={getBadgeColor(log.tip)}>{log.tip}</Badge>
                    </div>

                    <div className="text-sm text-muted-foreground mb-2">
                      {formatTimestamp(log.timestamp)} • {log.utilizator} • {log.categorie}
                    </div>

                    <div className="whitespace-pre-wrap bg-muted p-2 rounded text-sm mt-2">{log.detalii}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      </CardContent>

      <CardFooter className="flex justify-between">
        <div className="text-sm text-muted-foreground">
          {filteredLogs.length} loguri afișate din {logs.length} total
        </div>

        <Button variant="outline" onClick={exportLogs} disabled={filteredLogs.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          Export JSON
        </Button>
      </CardFooter>
    </Card>
  )
}
