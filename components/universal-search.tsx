"use client"

import { Search, X } from "lucide-react"
import { useState, useEffect, useCallback } from "react"

interface UniversalSearchProps {
  onSearch: (value: string) => void
  placeholder?: string
  initialValue?: string
  className?: string
}

export function UniversalSearch({
  onSearch,
  placeholder = "Caută în toate coloanele...",
  initialValue = "",
  className = "",
}: UniversalSearchProps) {
  const [searchText, setSearchText] = useState(initialValue)

  // Actualizăm valoarea de căutare când se schimbă initialValue
  useEffect(() => {
    setSearchText(initialValue)
  }, [initialValue])

  // Debounce search pentru performanță
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      onSearch(searchText)
    }, 300) // 300ms delay pentru debouncing

    return () => clearTimeout(timeoutId)
  }, [searchText, onSearch])

  // Handler pentru clear button
  const handleClear = useCallback(() => {
    setSearchText("")
  }, [])

  return (
    <div className={`relative flex-1 ${className}`}>
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
      <input
        type="text"
        placeholder={placeholder}
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        className="w-full h-10 pl-8 pr-10 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {searchText && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
