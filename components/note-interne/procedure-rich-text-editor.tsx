"use client"

import { useEffect } from "react"
import { useEditor, EditorContent } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import Underline from "@tiptap/extension-underline"
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
} from "lucide-react"
import { Toggle } from "@/components/ui/toggle"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const EMPTY_DOC = "<p></p>"

type ProcedureRichTextEditorProps = {
  value: string
  onChange: (html: string) => void
  disabled?: boolean
  className?: string
  editorClassName?: string
}

export function ProcedureRichTextEditor({
  value,
  onChange,
  disabled,
  className,
  editorClassName,
}: ProcedureRichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        code: false,
      }),
      Underline,
    ],
    content: value?.trim() ? value : EMPTY_DOC,
    editable: !disabled,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[380px] w-full max-w-none px-3 py-2 text-sm outline-none",
          "focus:outline-none [&_p]:min-h-[1em] [&_strong]:font-semibold [&_b]:font-semibold [&_em]:italic [&_i]:italic",
          "[&_u]:underline [&_s]:line-through [&_strike]:line-through",
          "[&_ul]:my-2 [&_ul]:ml-6 [&_ul]:list-disc [&_ul]:pl-1",
          "[&_ol]:my-2 [&_ol]:ml-6 [&_ol]:list-decimal [&_ol]:pl-1",
          "[&_li]:my-0.5 [&_li]:pl-0.5",
          disabled && "cursor-default",
          editorClassName
        ),
      },
    },
    onUpdate: ({ editor: ed }) => {
      onChange(ed.getHTML())
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!disabled)
  }, [disabled, editor])

  useEffect(() => {
    if (!editor) return
    const incoming = value?.trim() ? value : EMPTY_DOC
    if (incoming === editor.getHTML()) return
    editor.commands.setContent(incoming, false)
  }, [value, editor])

  if (!editor) {
    return (
      <div
        className={cn(
          "min-h-[420px] w-full rounded-md border border-input bg-muted/30 animate-pulse",
          className
        )}
      />
    )
  }

  return (
    <div
      className={cn(
        "rounded-md border border-input bg-background overflow-hidden",
        disabled && "bg-muted/50",
        className
      )}
    >
      {!disabled ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-input bg-muted/40 p-1.5">
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Îngroșat"
            pressed={editor.isActive("bold")}
            onPressedChange={() => editor.chain().focus().toggleBold().run()}
          >
            <Bold className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Cursiv"
            pressed={editor.isActive("italic")}
            onPressedChange={() => editor.chain().focus().toggleItalic().run()}
          >
            <Italic className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Subliniat"
            pressed={editor.isActive("underline")}
            onPressedChange={() => editor.chain().focus().toggleUnderline().run()}
          >
            <UnderlineIcon className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Tăiat"
            pressed={editor.isActive("strike")}
            onPressedChange={() => editor.chain().focus().toggleStrike().run()}
          >
            <Strikethrough className="h-4 w-4" />
          </Toggle>
          <Separator orientation="vertical" className="mx-0.5 h-7" />
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Listă cu puncte"
            pressed={editor.isActive("bulletList")}
            onPressedChange={() => editor.chain().focus().toggleBulletList().run()}
          >
            <List className="h-4 w-4" />
          </Toggle>
          <Toggle
            size="sm"
            variant="outline"
            aria-label="Listă numerotată"
            pressed={editor.isActive("orderedList")}
            onPressedChange={() => editor.chain().focus().toggleOrderedList().run()}
          >
            <ListOrdered className="h-4 w-4" />
          </Toggle>
        </div>
      ) : null}
      <EditorContent editor={editor} className="max-h-[min(65vh,640px)] overflow-y-auto" />
    </div>
  )
}
