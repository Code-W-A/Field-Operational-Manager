import { useEffect, useMemo, useState } from "react"
import { ensurePredefinedSettings, getPredefinedSettingValue } from "@/lib/firebase/predefined-settings"

export type DashboardStatusConfig = {
  programatorReviziiEnabled: boolean
  intarziateEnabled: boolean
  intarziateRequireExecDate: boolean
  intarziateIncludePastDays: boolean
  intarziateIncludeToday: boolean
  intarziateTodayRequiresAfter18: boolean
  intarziateRequireAssigned: boolean
  intarziateRequireNotScanned: boolean

  amanateEnabled: boolean

  listateEnabled: boolean
  listateRequireNoTechnicians: boolean

  nepreluateEnabled: boolean
  nepreluateRequireReportGenerated: boolean
  nepreluateRequireNotPickedUp: boolean

  nefacturateEnabled: boolean
  nefacturateRequireReportGenerated: boolean
  nefacturateRequireNoInvoice: boolean
  nefacturateRequireNoReason: boolean

  necesitaOfertaEnabled: boolean
  necesitaOfertaRequireFlag: boolean
  necesitaOfertaRequireNoResponse: boolean
  necesitaOfertaRequireReportGenerated: boolean
  necesitaOfertaRequirePickedUp: boolean

  ofertateEnabled: boolean
  ofertateRequireHasOffer: boolean
  ofertateRequireNoResponse: boolean

  statusOferteEnabled: boolean
  statusOferteIncludeAccept: boolean
  statusOferteIncludeReject: boolean

  equipmentStatusEnabled: boolean
  equipmentStatusIncludeNonFunctional: boolean
  equipmentStatusIncludePartiallyFunctional: boolean
}

const DEFAULTS: DashboardStatusConfig = {
  programatorReviziiEnabled: true,
  intarziateEnabled: true,
  intarziateRequireExecDate: true,
  intarziateIncludePastDays: true,
  intarziateIncludeToday: true,
  intarziateTodayRequiresAfter18: true,
  intarziateRequireAssigned: true,
  intarziateRequireNotScanned: true,

  amanateEnabled: true,

  listateEnabled: true,
  listateRequireNoTechnicians: true,

  nepreluateEnabled: true,
  nepreluateRequireReportGenerated: true,
  nepreluateRequireNotPickedUp: true,

  nefacturateEnabled: true,
  nefacturateRequireReportGenerated: true,
  nefacturateRequireNoInvoice: true,
  nefacturateRequireNoReason: true,

  necesitaOfertaEnabled: true,
  necesitaOfertaRequireFlag: true,
  necesitaOfertaRequireNoResponse: true,
  necesitaOfertaRequireReportGenerated: true,
  necesitaOfertaRequirePickedUp: true,

  ofertateEnabled: true,
  ofertateRequireHasOffer: true,
  ofertateRequireNoResponse: true,

  statusOferteEnabled: true,
  statusOferteIncludeAccept: true,
  statusOferteIncludeReject: true,

  equipmentStatusEnabled: true,
  equipmentStatusIncludeNonFunctional: true,
  equipmentStatusIncludePartiallyFunctional: true,
}

export function useDashboardStatusSettings() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<DashboardStatusConfig>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        await ensurePredefinedSettings()

        const [
          programatorReviziiEnabled,
          intarziateEnabled,
          intarziateRequireExecDate,
          intarziateIncludePastDays,
          intarziateIncludeToday,
          intarziateTodayRequiresAfter18,
          intarziateRequireAssigned,
          intarziateRequireNotScanned,

          amanateEnabled,

          listateEnabled,
          listateRequireNoTechnicians,

          nepreluateEnabled,
          nepreluateRequireReportGenerated,
          nepreluateRequireNotPickedUp,

          nefacturateEnabled,
          nefacturateRequireReportGenerated,
          nefacturateRequireNoInvoice,
          nefacturateRequireNoReason,

          necesitaOfertaEnabled,
          necesitaOfertaRequireFlag,
          necesitaOfertaRequireNoResponse,
          necesitaOfertaRequireReportGenerated,
          necesitaOfertaRequirePickedUp,

          ofertateEnabled,
          ofertateRequireHasOffer,
          ofertateRequireNoResponse,

          statusOferteEnabled,
          statusOferteIncludeAccept,
          statusOferteIncludeReject,

          equipmentStatusEnabled,
          equipmentStatusIncludeNonFunctional,
          equipmentStatusIncludePartiallyFunctional,
        ] = await Promise.all([
          getPredefinedSettingValue("dashboard_programator_revizii_enabled"),
          getPredefinedSettingValue("dashboard_intarziate_enabled"),
          getPredefinedSettingValue("dashboard_intarziate_require_exec_date"),
          getPredefinedSettingValue("dashboard_intarziate_include_past_days"),
          getPredefinedSettingValue("dashboard_intarziate_include_today"),
          getPredefinedSettingValue("dashboard_intarziate_include_today_after_18"),
          getPredefinedSettingValue("dashboard_intarziate_require_assigned"),
          getPredefinedSettingValue("dashboard_intarziate_require_not_scanned"),

          getPredefinedSettingValue("dashboard_amanate_enabled"),

          getPredefinedSettingValue("dashboard_listate_enabled"),
          getPredefinedSettingValue("dashboard_listate_require_no_technicians"),

          getPredefinedSettingValue("dashboard_nepreluate_enabled"),
          getPredefinedSettingValue("dashboard_nepreluate_require_report_generated"),
          getPredefinedSettingValue("dashboard_nepreluate_require_not_picked_up"),

          getPredefinedSettingValue("dashboard_nefacturate_enabled"),
          getPredefinedSettingValue("dashboard_nefacturate_require_report_generated"),
          getPredefinedSettingValue("dashboard_nefacturate_require_no_invoice"),
          getPredefinedSettingValue("dashboard_nefacturate_require_no_reason"),

          getPredefinedSettingValue("dashboard_necesita_oferta_enabled"),
          getPredefinedSettingValue("dashboard_necesita_oferta_require_flag"),
          getPredefinedSettingValue("dashboard_necesita_oferta_require_no_response"),
          getPredefinedSettingValue("dashboard_necesita_oferta_require_report_generated"),
          getPredefinedSettingValue("dashboard_necesita_oferta_require_picked_up"),

          getPredefinedSettingValue("dashboard_ofertate_enabled"),
          getPredefinedSettingValue("dashboard_ofertate_require_has_offer"),
          getPredefinedSettingValue("dashboard_ofertate_require_no_response"),

          getPredefinedSettingValue("dashboard_status_oferte_enabled"),
          getPredefinedSettingValue("dashboard_status_oferte_include_accept"),
          getPredefinedSettingValue("dashboard_status_oferte_include_reject"),

          getPredefinedSettingValue("dashboard_equipment_status_enabled"),
          getPredefinedSettingValue("dashboard_equipment_status_include_non_functional"),
          getPredefinedSettingValue("dashboard_equipment_status_include_partially_functional"),
        ])

        if (cancelled) return

        setConfig({
          programatorReviziiEnabled: Boolean(programatorReviziiEnabled),
          intarziateEnabled: Boolean(intarziateEnabled),
          intarziateRequireExecDate: Boolean(intarziateRequireExecDate),
          intarziateIncludePastDays: Boolean(intarziateIncludePastDays),
          intarziateIncludeToday: Boolean(intarziateIncludeToday),
          intarziateTodayRequiresAfter18: Boolean(intarziateTodayRequiresAfter18),
          intarziateRequireAssigned: Boolean(intarziateRequireAssigned),
          intarziateRequireNotScanned: Boolean(intarziateRequireNotScanned),

          amanateEnabled: Boolean(amanateEnabled),

          listateEnabled: Boolean(listateEnabled),
          listateRequireNoTechnicians: Boolean(listateRequireNoTechnicians),

          nepreluateEnabled: Boolean(nepreluateEnabled),
          nepreluateRequireReportGenerated: Boolean(nepreluateRequireReportGenerated),
          nepreluateRequireNotPickedUp: Boolean(nepreluateRequireNotPickedUp),

          nefacturateEnabled: Boolean(nefacturateEnabled),
          nefacturateRequireReportGenerated: Boolean(nefacturateRequireReportGenerated),
          nefacturateRequireNoInvoice: Boolean(nefacturateRequireNoInvoice),
          nefacturateRequireNoReason: Boolean(nefacturateRequireNoReason),

          necesitaOfertaEnabled: Boolean(necesitaOfertaEnabled),
          necesitaOfertaRequireFlag: Boolean(necesitaOfertaRequireFlag),
          necesitaOfertaRequireNoResponse: Boolean(necesitaOfertaRequireNoResponse),
          necesitaOfertaRequireReportGenerated: Boolean(necesitaOfertaRequireReportGenerated),
          necesitaOfertaRequirePickedUp: Boolean(necesitaOfertaRequirePickedUp),

          ofertateEnabled: Boolean(ofertateEnabled),
          ofertateRequireHasOffer: Boolean(ofertateRequireHasOffer),
          ofertateRequireNoResponse: Boolean(ofertateRequireNoResponse),

          statusOferteEnabled: Boolean(statusOferteEnabled),
          statusOferteIncludeAccept: Boolean(statusOferteIncludeAccept),
          statusOferteIncludeReject: Boolean(statusOferteIncludeReject),

          equipmentStatusEnabled: Boolean(equipmentStatusEnabled),
          equipmentStatusIncludeNonFunctional: Boolean(equipmentStatusIncludeNonFunctional),
          equipmentStatusIncludePartiallyFunctional: Boolean(equipmentStatusIncludePartiallyFunctional),
        })
      } catch (e) {
        console.warn("[useDashboardStatusSettings] failed to load predefined settings; using defaults", e)
        if (!cancelled) setConfig(DEFAULTS)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return useMemo(() => ({ loading, config }), [loading, config])
}
