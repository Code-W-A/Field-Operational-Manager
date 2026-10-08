/** Existing note-interne schema from the Next.js page. */
export interface ProcedureNote<TTimestamp = unknown> {
  id: string;
  title: string;
  content: string;
  priority?: "low" | "medium" | "high";
  category: "general" | "urgent" | "info" | "task";
  createdAt: TTimestamp;
  updatedAt: TTimestamp;
  authorId: string;
  authorName: string;
}
