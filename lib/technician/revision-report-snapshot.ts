/** Checklist answers are frozen in the report; the version identifier can be
 * a legacy copy of all settings and must not be duplicated into report data. */
export function revisionReportSnapshot(rows: Record<string, any>[]) {
  return rows.map(({ checklistVersionId: _version, ...document }) => document);
}
