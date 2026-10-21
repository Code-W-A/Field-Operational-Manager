/** Commercial fields are separate from equipment, sheets and signed documents. */
export const installationManagementKeys = [
  "preluatDispecer", "preluatDe", "necesitaOferta", "comentariiOferta", "statusOferta",
  "products", "offerTotal", "offerVAT", "offerAdjustmentPercent", "offerVersions", "conditiiOferta",
  "offerPreparedBy", "offerPreparedAt", "ofertaDocument",
  "devizProducts", "devizTotal", "devizVAT", "devizAdjustmentPercent", "devizVersions",
  "devizClientSnapshot", "devizConditions", "devizPreparedBy", "devizPreparedAt",
  "devizSendCount", "devizDocument", "facturaDocument", "statusFacturare", "motivNefacturare",
] as const;

export type InstallationManagementInput = {
  work: Record<string, unknown>;
  expectedAssignmentVersion?: number;
  append?: Record<string, unknown[]>;
  remove?: string[];
  serverTime?: string[];
};

export function isInstallationManagementPatch(patch: Record<string, unknown>) {
  const keys = Object.keys(patch);
  return keys.length > 0 && keys.every(key => (installationManagementKeys as readonly string[]).includes(key));
}
