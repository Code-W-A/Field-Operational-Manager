"use client"

import { useState, useEffect, useCallback } from "react"

interface TableSettings {
  activeFilters?: any[]
  columnVisibility?: Record<string, boolean>
  sorting?: { id: string; desc: boolean }[]
  searchText?: string
}

export function useTablePersistence(pageKey: string) {
  const storageKey = `table-settings-${pageKey}`

  // Load settings from localStorage
  const loadSettings = useCallback((): TableSettings => {
    if (typeof window === "undefined") return {}
    
    try {
      const saved = localStorage.getItem(storageKey)
      return saved ? JSON.parse(saved) : {}
    } catch (error) {
      console.error("Error loading table settings:", error)
      return {}
    }
  }, [storageKey])

  // Save settings to localStorage
  const saveSettings = useCallback((settings: Partial<TableSettings>) => {
    if (typeof window === "undefined") return
    
    try {
      const current = loadSettings()
      const updated = { ...current, ...settings }
      localStorage.setItem(storageKey, JSON.stringify(updated))
    } catch (error) {
      console.error("Error saving table settings:", error)
    }
  }, [storageKey, loadSettings])

  // Individual setters for different parts of settings
  const saveFilters = useCallback((filters: any[]) => {
    saveSettings({ activeFilters: filters })
  }, [saveSettings])

  const saveColumnVisibility = useCallback((visibility: Record<string, boolean>) => {
    saveSettings({ columnVisibility: visibility })
  }, [saveSettings])

  const saveSorting = useCallback((sorting: { id: string; desc: boolean }[]) => {
    saveSettings({ sorting })
  }, [saveSettings])

  const saveSearchText = useCallback((searchText: string) => {
    saveSettings({ searchText })
  }, [saveSettings])

  // Clear all settings
  const clearSettings = useCallback(() => {
    if (typeof window === "undefined") return
    localStorage.removeItem(storageKey)
  }, [storageKey])

  return {
    loadSettings,
    saveFilters,
    saveColumnVisibility,
    saveSorting,
    saveSearchText,
    clearSettings,
  }
} 