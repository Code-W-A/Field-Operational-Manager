"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useCache } from "@/contexts/CacheContext"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { RefreshCw, Trash2 } from "lucide-react"

export default function CacheAdminPage() {
  const { cacheStats, refreshStats, clearAllCache, clearCollectionCache } = useCache()
  const [autoRefresh, setAutoRefresh] = useState(false)

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(refreshStats, 5000)
      return () => clearInterval(interval)
    }
  }, [autoRefresh, refreshStats])

  if (!cacheStats) {
    return (
      <div className="flex items-center justify-center h-screen">
        <p>Se încarcă statisticile cache-ului...</p>
      </div>
    )
  }

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return bytes + " bytes"
    else if (bytes < 1048576) return (bytes / 1024).toFixed(2) + " KB"
    else return (bytes / 1048576).toFixed(2) + " MB"
  }

  const formatAge = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    if (seconds < 60) return `${seconds}s`
    const minutes = Math.floor(seconds / 60)
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`
    const hours = Math.floor(minutes / 60)
    return `${hours}h ${minutes % 60}m`
  }

  const collections = [...new Set(cacheStats.collections)]

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Administrare Cache</h1>
        <div className="flex space-x-2">
          <Button variant="outline" size="sm" onClick={refreshStats} className="flex items-center gap-1">
            <RefreshCw className="h-4 w-4" />
            Reîmprospătează
          </Button>
          <Button variant={autoRefresh ? "default" : "outline"} size="sm" onClick={() => setAutoRefresh(!autoRefresh)}>
            {autoRefresh ? "Dezactivează auto-refresh" : "Activează auto-refresh"}
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Intrări în cache</CardTitle>
            <CardDescription>Numărul total de intrări în cache</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{cacheStats.size}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Colecții</CardTitle>
            <CardDescription>Numărul de colecții în cache</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{collections.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Acțiuni</CardTitle>
            <CardDescription>Gestionare cache</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={clearAllCache} className="w-full">
              Șterge tot cache-ul
            </Button>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="mb-4">
          <TabsTrigger value="all">Toate intrările</TabsTrigger>
          <TabsTrigger value="collections">După colecție</TabsTrigger>
        </TabsList>

        <TabsContent value="all">
          <Card>
            <CardHeader>
              <CardTitle>Toate intrările din cache</CardTitle>
              <CardDescription>Detalii despre toate intrările din cache</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cheie</TableHead>
                    <TableHead>Dimensiune</TableHead>
                    <TableHead>Vârstă</TableHead>
                    <TableHead>Ultima actualizare</TableHead>
                    <TableHead>Acțiuni</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cacheStats.items.map((item: any) => (
                    <TableRow key={item.key}>
                      <TableCell className="font-mono text-xs">{item.key}</TableCell>
                      <TableCell>{formatBytes(item.size)}</TableCell>
                      <TableCell>{formatAge(item.age)}</TableCell>
                      <TableCell>{item.lastUpdated}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            const collection = item.key.split("_")[0]
                            clearCollectionCache(collection)
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="collections">
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {collections.map((collection: string) => {
              const collectionItems = cacheStats.items.filter((item: any) => item.key.startsWith(`${collection}_`))
              const totalSize = collectionItems.reduce((acc: number, item: any) => acc + item.size, 0)

              return (
                <Card key={collection}>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>{collection}</CardTitle>
                      <Badge>{collectionItems.length} intrări</Badge>
                    </div>
                    <CardDescription>Dimensiune totală: {formatBytes(totalSize)}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {collectionItems.slice(0, 3).map((item: any) => (
                        <div key={item.key} className="text-sm">
                          <div className="font-mono text-xs truncate">{item.key}</div>
                          <div className="flex justify-between text-muted-foreground">
                            <span>{formatBytes(item.size)}</span>
                            <span>{formatAge(item.age)}</span>
                          </div>
                        </div>
                      ))}
                      {collectionItems.length > 3 && (
                        <div className="text-sm text-muted-foreground text-center">
                          + {collectionItems.length - 3} mai multe intrări
                        </div>
                      )}
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => clearCollectionCache(collection)}
                    >
                      Șterge cache pentru {collection}
                    </Button>
                  </CardFooter>
                </Card>
              )
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
