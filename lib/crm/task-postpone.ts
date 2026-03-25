import { addDays, max, setHours, setMilliseconds, setMinutes, setSeconds, startOfDay } from "date-fns"

export type TaskPostponePreset = "TOMORROW" | "IN_3_DAYS" | "IN_1_WEEK" | "IN_2_WEEKS"

const PRESET_DAY_OFFSET: Record<TaskPostponePreset, number> = {
  TOMORROW: 1,
  IN_3_DAYS: 3,
  IN_1_WEEK: 7,
  IN_2_WEEKS: 14,
}

export const TASK_POSTPONE_PRESETS: TaskPostponePreset[] = ["TOMORROW", "IN_3_DAYS", "IN_1_WEEK", "IN_2_WEEKS"]

export const TASK_POSTPONE_LABELS: Record<TaskPostponePreset, string> = {
  TOMORROW: "Mâine",
  IN_3_DAYS: "Peste 3 zile",
  IN_1_WEEK: "Peste 1 săptămână",
  IN_2_WEEKS: "Peste 2 săptămâni",
}

/**
 * Ancorează pe max(începutul zilei de azi, începutul zilei termenului curent), adaugă N zile,
 * păstrează ora/minutele/secunde din termenul curent.
 */
export function computePostponedDueAt(currentDue: Date, preset: TaskPostponePreset): Date {
  const offset = PRESET_DAY_OFFSET[preset]
  const todayStart = startOfDay(new Date())
  const dueDayStart = startOfDay(currentDue)
  const refStart = max([todayStart, dueDayStart])
  let next = addDays(refStart, offset)

  next = setHours(next, currentDue.getHours())
  next = setMinutes(next, currentDue.getMinutes())
  next = setSeconds(next, currentDue.getSeconds())
  next = setMilliseconds(next, currentDue.getMilliseconds())
  return next
}
