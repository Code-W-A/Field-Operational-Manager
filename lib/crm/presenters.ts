import { formatDistanceToNow } from "date-fns"
import { ro } from "date-fns/locale"
import {
  CRM_PIPELINE_STAGE_LABELS,
  CRM_PRIORITY_LABELS,
  CRM_TASK_STATUS_LABELS,
  CRM_WORK_STATUS_LABELS,
} from "@/lib/crm/constants"
import { getDateValue } from "@/lib/crm/activity"

export function formatRelativeDate(value: unknown) {
  const parsed = getDateValue(value)
  if (!parsed) return "-"
  return formatDistanceToNow(parsed, { addSuffix: true, locale: ro })
}

export function formatDateTime(value: unknown) {
  const parsed = getDateValue(value)
  if (!parsed) return "-"

  return parsed.toLocaleString("ro-RO", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function priorityLabel(value: string) {
  return CRM_PRIORITY_LABELS[value as keyof typeof CRM_PRIORITY_LABELS] || value
}

export function stageLabel(value: string) {
  return CRM_PIPELINE_STAGE_LABELS[value as keyof typeof CRM_PIPELINE_STAGE_LABELS] || value
}

export function workStatusLabel(value: string) {
  return CRM_WORK_STATUS_LABELS[value as keyof typeof CRM_WORK_STATUS_LABELS] || value
}

export function taskStatusLabel(value: string) {
  return CRM_TASK_STATUS_LABELS[value as keyof typeof CRM_TASK_STATUS_LABELS] || value
}
