import { cn } from "@/lib/utils"

export type TaskCounterTone = "active" | "inProgress" | "done" | "overdue"

const toneClass: Record<
  TaskCounterTone,
  { ring: string; text: string; surface: string; active: string; dot: string }
> = {
  active: {
    ring: "border-sky-500",
    text: "text-sky-700",
    surface: "hover:border-sky-200",
    active: "border-sky-200 bg-sky-50/40",
    dot: "bg-sky-500",
  },
  inProgress: {
    ring: "border-slate-400",
    text: "text-slate-700",
    surface: "hover:border-slate-300",
    active: "border-slate-300 bg-slate-50/70",
    dot: "bg-slate-400",
  },
  done: {
    ring: "border-lime-500",
    text: "text-lime-700",
    surface: "hover:border-lime-200",
    active: "border-lime-200 bg-lime-50/40",
    dot: "bg-lime-500",
  },
  overdue: {
    ring: "border-red-500",
    text: "text-red-700",
    surface: "hover:border-red-200",
    active: "border-red-200 bg-red-50/40",
    dot: "bg-red-500",
  },
}

interface TaskCounterRingProps {
  label: string
  value: number
  tone: TaskCounterTone
  active?: boolean
  loading?: boolean
  onClick?: () => void
}

export function TaskCounterRing({ label, value, tone, active = false, loading = false, onClick }: TaskCounterRingProps) {
  if (loading) {
    return (
      <div className="rounded-md border border-neutral-200 bg-white px-2 py-3">
        <div className="mx-auto mb-2 h-3 w-24 animate-pulse rounded bg-neutral-100" />
        <div className="mx-auto h-24 w-24 animate-pulse rounded-full border-[5px] border-neutral-200 bg-neutral-100" />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "w-full rounded-md border border-neutral-200 bg-white px-2 py-3 text-center transition",
        toneClass[tone].surface,
        active && toneClass[tone].active
      )}
    >
      <p className="mb-2 inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-neutral-500">
        <span className={cn("h-2 w-2 rounded-full", toneClass[tone].dot)} />
        <span>{label}</span>
      </p>
      <div className={cn("mx-auto flex h-24 w-24 items-center justify-center rounded-full border-[5px] bg-white", toneClass[tone].ring)}>
        <span className={cn("text-[44px] font-normal leading-none tabular-nums", toneClass[tone].text)}>{value}</span>
      </div>
    </button>
  )
}
