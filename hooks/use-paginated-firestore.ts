"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import {
  collection,
  query,
  getDocs,
  limit,
  startAfter,
  orderBy as fsOrderBy,
  type QueryConstraint,
  type DocumentData,
  type Query,
  type QueryDocumentSnapshot,
  getCountFromServer,
} from "firebase/firestore"
import { db } from "@/lib/firebase/config"
import { useMockData } from "@/contexts/MockDataContext"

export function usePaginatedFirestore<T extends DocumentData>(
  collectionName: string,
  pageSize = 10,
  orderBy = "createdAt",
  orderDirection: "asc" | "desc" = "desc",
  constraints: QueryConstraint[] = [],
  customQuery?: Query<DocumentData>,
) {
  const [data, setData] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [lastVisible, setLastVisible] = useState<QueryDocumentSnapshot | null>(null)
  const [totalCount, setTotalCount] = useState(0)
  const [currentPage, setCurrentPage] = useState(1)
  const [hasMore, setHasMore] = useState(true)
  const { isPreview, lucrari, clienti, users, logs } = useMockData()

  // Use refs to prevent infinite loops
  const initialLoadDone = useRef(false)
  const previousPageSize = useRef(pageSize)

  // Function to get total count
  const fetchTotalCount = useCallback(async () => {
    if (isPreview) {
      let mockCount = 0
      switch (collectionName) {
        case "lucrari":
          mockCount = lucrari.length
          break
        case "clienti":
          mockCount = clienti.length
          break
        case "users":
          mockCount = users.length
          break
        case "logs":
          mockCount = logs.length
          break
        default:
          mockCount = 0
      }
      setTotalCount(mockCount)
      console.log(`[Pagination] Total count for ${collectionName}: ${mockCount}`)
      return
    }

    try {
      const coll = collection(db, collectionName)
      const snapshot = await getCountFromServer(coll)
      const count = snapshot.data().count
      setTotalCount(count)
      console.log(`[Pagination] Total count for ${collectionName}: ${count}`)
    } catch (err) {
      console.error("Error getting count:", err)
    }
  }, [collectionName, isPreview, lucrari, clienti, users, logs])

  // Function to load the first page
  const loadFirstPage = useCallback(async () => {
    setLoading(true)
    console.log(`[Pagination] Loading first page of ${collectionName} with page size ${pageSize}`)
    setCurrentPage(1)

    if (isPreview) {
      // Handle mock data for preview mode
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

      // Apply pagination to mock data
      const paginatedData = mockData.slice(0, pageSize) as T[]
      setData(paginatedData)
      setHasMore(mockData.length > pageSize)
      setLoading(false)
      return
    }

    try {
      // Build query with pagination
      const baseQuery =
        customQuery ||
        query(collection(db, collectionName), fsOrderBy(orderBy, orderDirection), ...constraints, limit(pageSize))

      const querySnapshot = await getDocs(baseQuery)

      // Set last visible document for pagination
      const lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1]
      setLastVisible(lastVisibleDoc || null)

      // Check if there are more documents
      setHasMore(querySnapshot.docs.length === pageSize)

      // Map documents to data
      const documents = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[]

      setData(documents)
      console.log(`[Pagination] Loaded ${documents.length} items for first page of ${collectionName}`)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [
    collectionName,
    constraints,
    customQuery,
    isPreview,
    lucrari,
    clienti,
    users,
    logs,
    orderBy,
    orderDirection,
    pageSize,
  ])

  // Function to load the next page
  const loadNextPage = useCallback(async () => {
    if (!hasMore || loading) return

    setLoading(true)
    console.log(`[Pagination] Loading page ${currentPage + 1} of ${collectionName}`)

    if (isPreview) {
      // Handle mock data for preview mode
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

      // Calculate start index for next page
      const startIndex = currentPage * pageSize

      // Apply pagination to mock data
      const paginatedData = mockData.slice(startIndex, startIndex + pageSize) as T[]

      setData((prevData) => [...prevData, ...paginatedData])
      setCurrentPage((prev) => prev + 1)
      setHasMore(startIndex + pageSize < mockData.length)
      setLoading(false)
      return
    }

    try {
      if (!lastVisible) {
        setHasMore(false)
        setLoading(false)
        return
      }

      // Build query with pagination starting after the last document
      const nextQuery = customQuery
        ? query(customQuery, startAfter(lastVisible), limit(pageSize))
        : query(
            collection(db, collectionName),
            fsOrderBy(orderBy, orderDirection),
            ...constraints,
            startAfter(lastVisible),
            limit(pageSize),
          )

      const querySnapshot = await getDocs(nextQuery)

      // Set last visible document for pagination
      const lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1]
      setLastVisible(lastVisibleDoc || null)

      // Check if there are more documents
      setHasMore(querySnapshot.docs.length === pageSize)

      // Map documents to data
      const newDocuments = querySnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as T[]

      setData((prevData) => {
        const newData = [...prevData, ...newDocuments]
        console.log(`[Pagination] Loaded ${newData.length} total items for ${collectionName} (page ${currentPage + 1})`)
        return newData
      })
      setCurrentPage((prev) => prev + 1)
      setLoading(false)
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)))
      setLoading(false)
    }
  }, [
    collectionName,
    constraints,
    customQuery,
    hasMore,
    isPreview,
    lastVisible,
    loading,
    lucrari,
    clienti,
    users,
    logs,
    currentPage,
    pageSize,
    orderBy,
    orderDirection,
  ])

  // Function to go to a specific page
  const goToPage = useCallback(
    async (page: number) => {
      if (page < 1 || page === currentPage) return

      setLoading(true)
      console.log(`[Pagination] Going to page ${page} of ${collectionName}`)

      if (isPreview) {
        // Handle mock data for preview mode
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

        // Calculate start index for the requested page
        const startIndex = (page - 1) * pageSize

        // Apply pagination to mock data
        const paginatedData = mockData.slice(startIndex, startIndex + pageSize) as T[]

        setData(paginatedData)
        setCurrentPage(page)
        setHasMore(startIndex + pageSize < mockData.length)
        setLoading(false)
        return
      }

      try {
        // If going to first page, use loadFirstPage
        if (page === 1) {
          loadFirstPage()
          return
        }

        // If going forward from current page, we can use loadNextPage repeatedly
        if (page > currentPage) {
          // This is inefficient for large jumps, but works for now
          // For a more efficient solution, we would need to store cursors for each page
          for (let i = currentPage; i < page; i++) {
            await loadNextPage()
          }
          return
        }

        // If going backward, we need to start from the beginning
        // This is inefficient, but Firestore doesn't support backward pagination easily
        const baseQuery =
          customQuery ||
          query(
            collection(db, collectionName),
            fsOrderBy(orderBy, orderDirection),
            ...constraints,
            limit(page * pageSize),
          )

        const querySnapshot = await getDocs(baseQuery)

        // Set last visible document for pagination
        const lastVisibleDoc = querySnapshot.docs[querySnapshot.docs.length - 1]
        setLastVisible(lastVisibleDoc || null)

        // Check if there are more documents
        setHasMore(querySnapshot.docs.length === page * pageSize)

        // Get only the documents for the requested page
        const startIndex = (page - 1) * pageSize
        const pageDocuments = querySnapshot.docs.slice(startIndex).map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as T[]

        setData(pageDocuments)
        setCurrentPage(page)
        setLoading(false)
      } catch (err) {
        setError(err instanceof Error ? err : new Error(String(err)))
        setLoading(false)
      }
    },
    [
      collectionName,
      constraints,
      customQuery,
      currentPage,
      isPreview,
      loadFirstPage,
      loadNextPage,
      lucrari,
      clienti,
      users,
      logs,
      pageSize,
      orderBy,
      orderDirection,
    ],
  )

  // Load first page and total count on initial render only
  useEffect(() => {
    if (!initialLoadDone.current) {
      fetchTotalCount()
      loadFirstPage()
      initialLoadDone.current = true
    }
  }, []) // Empty dependency array - run only once on mount

  // Handle pageSize changes
  useEffect(() => {
    // Only reload if pageSize actually changed and initial load is done
    if (initialLoadDone.current && previousPageSize.current !== pageSize) {
      console.log(`[Pagination] Page size changed from ${previousPageSize.current} to ${pageSize}, reloading data`)
      previousPageSize.current = pageSize
      loadFirstPage()
    }
  }, [pageSize, loadFirstPage])

  return {
    data,
    loading,
    error,
    hasMore,
    loadNextPage,
    loadFirstPage,
    goToPage,
    currentPage,
    totalCount,
    pageSize,
    totalPages: Math.ceil(totalCount / pageSize),
  }
}
