/** Existing note-interne schema from the Next.js page. */
export interface ProcedureNote<TTimestamp = unknown> {
  id: string;
  /** Absent/null for existing top-level procedures. */
  parentId?: string | null;
  title: string;
  content: string;
  priority?: "low" | "medium" | "high";
  category: "general" | "urgent" | "info" | "task";
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
  authorId: string;
  authorName: string;
}
