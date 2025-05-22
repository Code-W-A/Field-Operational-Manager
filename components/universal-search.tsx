"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Input } from "@/components/ui/input"
import { Search } from "lucide-react"

interface UniversalSearchProps {
  onSearch: (value: string) => void
  className?: string
  initialValue?: string // Add this prop to accept initial value
}

export function UniversalSearch({ onSearch, className, initialValue = "" }: UniversalSearchProps) {
  const [searchText, setSearchText] = useState(initialValue)

  // Add this effect to sync with external initialValue changes
  useEffect(() => {
    if (initialValue !== undefined) {
      setSearchText(initialValue)
    }
  }, [initialValue])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchText(value)
    onSearch(value)
  }

  return (
    <div className={`relative ${className}`}>
      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input type="search" placeholder="Caută..." className="pl-8" value={searchText} onChange={handleSearch} />
    </div>
  )
}
