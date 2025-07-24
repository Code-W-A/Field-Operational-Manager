"use client"

import React, { useState, useRef, useCallback } from "react"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"

interface MultiEmailInputProps {
  emails: string[]
  onEmailsChange: (emails: string[]) => void
  placeholder?: string
  className?: string
  disabled?: boolean
}

// Helper function to validate email format
const isValidEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return emailRegex.test(email.trim())
}

export function MultiEmailInput({
  emails,
  onEmailsChange,
  placeholder = "Introduceți adresele de email...",
  className,
  disabled = false,
}: MultiEmailInputProps) {
  const [inputValue, setInputValue] = useState("")
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const addEmail = useCallback((email: string) => {
    const trimmedEmail = email.trim()
    console.log(`📧 MultiEmailInput: Încercare adăugare email: "${trimmedEmail}"`)
    
    if (!trimmedEmail) {
      console.log(`❌ Email gol, se ignoră`)
      return false
    }
    
    if (!isValidEmail(trimmedEmail)) {
      console.log(`❌ Email invalid: "${trimmedEmail}"`)
      return false
    }
    
    if (emails.includes(trimmedEmail)) {
      console.log(`❌ Email duplicat: "${trimmedEmail}"`)
      return false
    }
    
    const newEmails = [...emails, trimmedEmail]
    console.log(`✅ Email adăugat cu succes: "${trimmedEmail}"`)
    console.log(`📊 Lista actualizată de emailuri: ${JSON.stringify(newEmails)}`)
    
    onEmailsChange(newEmails)
    setInputValue("")
    return true
  }, [emails, onEmailsChange])

  const removeEmail = useCallback((indexToRemove: number) => {
    onEmailsChange(emails.filter((_, index) => index !== indexToRemove))
  }, [emails, onEmailsChange])

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const value = inputValue.trim()

    switch (e.key) {
      case "Enter":
      case ",":
      case " ":
        e.preventDefault()
        if (value) {
          const success = addEmail(value)
          if (!success && value) {
            // Dacă emailul nu este valid, îl păstrăm în input pentru corectare
            return
          }
        }
        break

      case "Backspace":
        if (!inputValue && emails.length > 0) {
          // Șterge ultimul email dacă input-ul este gol
          removeEmail(emails.length - 1)
        }
        break

      case "ArrowLeft":
        if (!inputValue && emails.length > 0) {
          setFocusedIndex(emails.length - 1)
        }
        break
    }
  }

  const handleInputBlur = () => {
    // Adaugă emailul la blur dacă este valid
    if (inputValue.trim()) {
      addEmail(inputValue.trim())
    }
    setFocusedIndex(null)
  }

  const handleBadgeKeyDown = (e: React.KeyboardEvent, index: number) => {
    switch (e.key) {
      case "Backspace":
      case "Delete":
        removeEmail(index)
        inputRef.current?.focus()
        setFocusedIndex(null)
        break
      case "ArrowLeft":
        if (index > 0) {
          setFocusedIndex(index - 1)
        }
        break
      case "ArrowRight":
        if (index < emails.length - 1) {
          setFocusedIndex(index + 1)
        } else {
          inputRef.current?.focus()
          setFocusedIndex(null)
        }
        break
    }
  }

  const handleContainerClick = () => {
    inputRef.current?.focus()
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div
        className={cn(
          "min-h-[40px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
          "cursor-text flex flex-wrap gap-1 items-center",
          disabled && "cursor-not-allowed opacity-50",
        )}
        onClick={handleContainerClick}
      >
        {/* Email badges */}
        {emails.map((email, index) => (
          <Badge
            key={index}
            variant="secondary"
            className={cn(
              "flex items-center gap-1 px-2 py-1 text-xs font-normal",
              "bg-blue-100 text-blue-800 hover:bg-blue-200",
              "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1",
              focusedIndex === index && "ring-2 ring-blue-500 ring-offset-1",
            )}
            tabIndex={0}
            onKeyDown={(e) => handleBadgeKeyDown(e, index)}
            onFocus={() => setFocusedIndex(index)}
          >
            <span>{email}</span>
            <button
              type="button"
              className="ml-1 hover:bg-blue-300 rounded-full p-0.5 transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                removeEmail(index)
              }}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}

        {/* Input pentru noi emailuri */}
        <Input
          ref={inputRef}
          type="email"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleInputKeyDown}
          onBlur={handleInputBlur}
          placeholder={emails.length === 0 ? placeholder : ""}
          className="border-0 p-0 h-auto min-w-[120px] focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
          disabled={disabled}
        />
      </div>

      {/* Helper text */}
      <p className="text-xs text-muted-foreground">
        Introduceți emailurile și apăsați{" "}
        <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Enter</kbd>,{" "}
        <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Virgulă</kbd> sau{" "}
        <kbd className="px-1 py-0.5 text-xs bg-muted rounded">Spațiu</kbd> pentru a le adăuga.
      </p>

      {/* Validare vizuală pentru input curent */}
      {inputValue && !isValidEmail(inputValue) && (
        <p className="text-xs text-red-500">
          Formatul emailului nu este valid
        </p>
      )}

      {/* Counter și status */}
      {emails.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {emails.length} email{emails.length !== 1 ? "uri" : ""} adăugat{emails.length !== 1 ? "e" : ""}
        </p>
      )}
    </div>
  )
} 