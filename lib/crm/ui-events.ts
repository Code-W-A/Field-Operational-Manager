export const CRM_CALENDAR_FOCUS_MODE_EVENT = "crm:calendar-focus-mode"

export type CrmCalendarFocusModeEventDetail = {
  opportunityId: string
  active: boolean
}

export function dispatchCrmCalendarFocusMode(detail: CrmCalendarFocusModeEventDetail) {
  if (typeof window === "undefined") return

  window.dispatchEvent(
    new CustomEvent<CrmCalendarFocusModeEventDetail>(CRM_CALENDAR_FOCUS_MODE_EVENT, {
      detail,
    })
  )
}
