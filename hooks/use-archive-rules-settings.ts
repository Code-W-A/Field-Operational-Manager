import { useEffect, useMemo, useState } from "react"
import { ensurePredefinedSettings, getPredefinedSettingValue } from "@/lib/firebase/predefined-settings"
import type { ArchiveRulesConfig } from "@/lib/utils/archive-validation"

const DEFAULTS: ArchiveRulesConfig = {
  requireFinalizedStatus: true,
  requireDispatcherPickup: true,
  requireInvoiceOrNoInvoicing: true,
  requireNoInvoicingReason: true,
  offerRequireOfferSentWhenNeeded: true,
  offerBlockWhenAccepted: true,
  offerWait30DaysWhenNoResponse: true,
}

export function useArchiveRulesSettings() {
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState<ArchiveRulesConfig>(DEFAULTS)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        setLoading(true)
        // Ensure docs exist with defaults, even if admin hasn't visited /dashboard/setari yet.
        await ensurePredefinedSettings()

        const [
          requireFinalizedStatus,
          requireDispatcherPickup,
          requireInvoiceOrNoInvoicing,
          requireNoInvoicingReason,
          offerRequireOfferSentWhenNeeded,
          offerBlockWhenAccepted,
          offerWait30DaysWhenNoResponse,
        ] = await Promise.all([
          getPredefinedSettingValue("archive_require_finalized_status"),
          getPredefinedSettingValue("archive_require_dispatcher_pickup"),
          getPredefinedSettingValue("archive_require_invoice_or_no_invoicing"),
          getPredefinedSettingValue("archive_require_no_invoicing_reason"),
          getPredefinedSettingValue("archive_offer_require_offer_sent_when_needed"),
          getPredefinedSettingValue("archive_offer_block_when_accepted"),
          getPredefinedSettingValue("archive_offer_wait_30_days_when_no_response"),
        ])

        if (cancelled) return
        setConfig({
          requireFinalizedStatus: Boolean(requireFinalizedStatus),
          requireDispatcherPickup: Boolean(requireDispatcherPickup),
          requireInvoiceOrNoInvoicing: Boolean(requireInvoiceOrNoInvoicing),
          requireNoInvoicingReason: Boolean(requireNoInvoicingReason),
          offerRequireOfferSentWhenNeeded: Boolean(offerRequireOfferSentWhenNeeded),
          offerBlockWhenAccepted: Boolean(offerBlockWhenAccepted),
          offerWait30DaysWhenNoResponse: Boolean(offerWait30DaysWhenNoResponse),
        })
      } catch (e) {
        console.warn("[useArchiveRulesSettings] failed to load predefined settings; using defaults", e)
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


