"use client"

import { useState, useEffect, useCallback } from "react"
import {
  collection,
  query,
  getDocs,
  type QueryConstraint,
  type DocumentData,
  type Query,
  limit,
  startAfter,
  orderBy as firestoreOrderBy,
  getCountFromServer,
  type DocumentSnapshot,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useMockData } from "@/contexts/MockDataContext"

export interface PaginationOptions {
  pageSize: number
  orderBy?: { field: string; direction: "asc" | "desc" }
}

export function useFirebasePagination<T extends DocumentData>(
  collectionName: string,
  constraints: QueryConstraint[] = [],
  paginationOptions: PaginationOptions = { pageSize: 10, orderBy: { field: "createdAt", direction: "desc" } },
  customQuery?: Query<DocumentData>,
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastVisible, setLastVisible] = useState<DocumentSnapshot | null>(null)
  const [totalCount, setTotalCount] = useState<number>(0)
  const [hasMore, setHasMore] = useState(true)
  const [currentPage, setCurrentPage] = useState(1)
  const { isPreview, lucrari, clienti, users, logs } = useMockData()

  // Funcție pentru a obține numărul total de documente
  const fetchTotalCount = useCallback(async () => {
    if (isPreview) {
      // În modul preview, folosim lungimea array-urilor mock
      let count = 0
      switch (collectionName) {
        case "lucrari":
          count = lucrari.length
          break
        case "clienti":
          count = clienti.length
          break
        case "users":
          count = users.length
          break
        case "logs":
          count = logs.length
          break
        default:
          count = 0
      }
      setTotalCount(count)
      return
    }

    try {
      // Construim un query fără limit pentru a număra toate documentele
      const countQuery = customQuery || query(collection(db, collectionName), ...constraints)
      const countSnapshot = await getCountFromServer(countQuery)
      setTotalCount(countSnapshot.data().count)
    } catch (err) {
      console.error("Eroare la numărarea documentelor:", err)
    }
  }, [collectionName, constraints, customQuery, isPreview, lucrari, clienti, users, logs])

  // Funcție pentru a încărca prima pagină
  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    setError(null)
    setCurrentPage(1)

    if (isPreview) {
      // În modul preview, simulăm paginația cu datele mock
      const timer = setTimeout(() => {
        let mockData: any[] = []
        switch (collectionName) {
          case "lucrari":
            mockData = lucrari
            break
          case "clienti":
            mockData = clienti
            break
          case "users":
            mockData = users
            break
          case "logs":
            mockData = logs
            break
          default:
            mockData = []
        }

        // Aplicăm sortarea dacă este specificată
        if (paginationOptions.orderBy) {
          const { field, direction } = paginationOptions.orderBy
          mockData = [...mockData].sort((a, b) => {
            if (direction === "asc") {
              return a[field] > b[field] ? 1 : -1
            } else {
              return a[field] < b[field] ? 1 : -1
            }
          })
        }

        // Aplicăm paginația
        const paginatedData = mockData.slice(0, paginationOptions.pageSize)
        setData(paginatedData as T[])
        setHasMore(mockData.length > paginationOptions.pageSize)
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }

    try {
      // Construim query-ul pentru prima pagină
      let baseQuery: Query<DocumentData>

      if (customQuery) {
        baseQuery = customQuery
      } else {
        // Adăugăm orderBy dacă este specificat
        const queryConstraints = [...constraints]
        if (paginationOptions.orderBy) {
          queryConstraints.push(firestoreOrderBy(paginationOptions.orderBy.field, paginationOptions.orderBy.direction))
        }

        // Adăugăm limita
        queryConstraints.push(limit(paginationOptions.pageSize))
        baseQuery = query(collection(db, collectionName), ...queryConstraints)
      }

      const querySnapshot = await getDocs(baseQuery)

      // Salvăm ultimul document vizibil pentru paginația ulterioară
      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1]
      setLastVisible(lastDoc || null)

      // Verificăm dacă mai sunt documente de încărcat
      setHasMore(querySnapshot.docs.length === paginationOptions.pageSize)

      // Transformăm documentele în obiecte cu ID
      const documents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[]

      setData(documents)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [collectionName, constraints, customQuery, isPreview, lucrari, clienti, users, logs, paginationOptions])

  // Funcție pentru a încărca pagina următoare
  const loadNextPage = useCallback(async () => {
    if (!hasMore || loading) return

    setLoading(true)
    setError(null)

    if (isPreview) {
      // În modul preview, simulăm paginația cu datele mock
      const timer = setTimeout(() => {
        let mockData: any[] = []
        switch (collectionName) {
          case "lucrari":
            mockData = lucrari
            break
          case "clienti":
            mockData = clienti
            break
          case "users":
            mockData = users
            break
          case "logs":
            mockData = logs
            break
          default:
            mockData = []
        }

        // Aplicăm sortarea dacă este specificată
        if (paginationOptions.orderBy) {
          const { field, direction } = paginationOptions.orderBy
          mockData = [...mockData].sort((a, b) => {
            if (direction === "asc") {
              return a[field] > b[field] ? 1 : -1
            } else {
              return a[field] < b[field] ? 1 : -1
            }
          })
        }

        // Calculăm indexul de start pentru pagina curentă
        const startIndex = currentPage * paginationOptions.pageSize

        // Aplicăm paginația
        const paginatedData = mockData.slice(startIndex, startIndex + paginationOptions.pageSize)

        // Adăugăm noile date la cele existente
        setData((prevData) => [...prevData, ...paginatedData] as T[])
        setHasMore(startIndex + paginationOptions.pageSize < mockData.length)
        setCurrentPage((prev) => prev + 1)
        setLoading(false)
      }, 1000)

      return () => clearTimeout(timer)
    }

    try {
      if (!lastVisible) {
        setHasMore(false)
        setLoading(false)
        return
      }

      // Construim query-ul pentru pagina următoare
      let nextQuery: Query<DocumentData>

      if (customQuery) {
        // Nu putem modifica direct customQuery, așa că vom afișa un avertisment
        console.warn("Custom query nu poate fi paginat. Folosiți constraints în loc.")
        setHasMore(false)
        setLoading(false)
        return
      } else {
        // Adăugăm orderBy dacă este specificat
        const queryConstraints = [...constraints]
        if (paginationOptions.orderBy) {
          queryConstraints.push(firestoreOrderBy(paginationOptions.orderBy.field, paginationOptions.orderBy.direction))
        }

        // Adăugăm startAfter și limit
        queryConstraints.push(startAfter(lastVisible))
        queryConstraints.push(limit(paginationOptions.pageSize))

        nextQuery = query(collection(db, collectionName), ...queryConstraints)
      }

      const querySnapshot = await getDocs(nextQuery)

      // Salvăm ultimul document vizibil pentru paginația ulterioară
      const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1]
      setLastVisible(lastDoc || null)

      // Verificăm dacă mai sunt documente de încărcat
      setHasMore(querySnapshot.docs.length === paginationOptions.pageSize)

      // Transformăm documentele în obiecte cu ID
      const newDocuments = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[]

      // Adăugăm noile documente la cele existente
      setData((prevData) => [...prevData, ...newDocuments])
      setCurrentPage((prev) => prev + 1)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [
    hasMore,
    loading,
    lastVisible,
    collectionName,
    constraints,
    customQuery,
    isPreview,
    lucrari,
    clienti,
    users,
    logs,
    paginationOptions,
    currentPage,
  ])

  // Inițializăm paginația la montarea componentei
  useEffect(() => {
    fetchTotalCount()
    loadFirstPage()
  }, [fetchTotalCount, loadFirstPage])

  return {
    data,
    loading,
    error,
    hasMore,
    loadNextPage,
    loadFirstPage,
    totalCount,
    currentPage,
  }
}
