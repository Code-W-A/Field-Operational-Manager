# ETAPA 8B - defecte Condica

## Remediate

1. **Manual route omitted from summary.** `AddDayEntryDialog` persista `travelToClient: true`, iar `calculateEmployeeTimesheetSummary` citea exclusiv `project === "traseu catre client"`. Corectat in `lib/hr/timesheet-summary.ts`; regresie `CON-006`.
2. **Risc de scriere partiala pe interval multi-zi.** Dialogul apela `upsertTimesheetCell` in bucla. Corectat prin `upsertTimesheetCells`, un singur commit pentru documentul `hrTimesheets/{employeeId}_{month}`; regresie `CON-012`.
3. **Date din alta luna puteau ajunge in documentul lunii curente.** Corectat in dialog si defensiv in pagina Condicii; regresie `CON-014/016`.
4. **Stari de date nereprezentate.** Erorile pentru salariat/condica erau ignorate. Pagina expune acum loading/error/empty si retry.

## Neinchise in aceasta rulare

- CON-017 si CON-018: simularea determinista a esecului de scriere/stergerii partiale.
- CON-019: administrarea completa a sarbatorilor legale.
- CON-020: editarea unei cereri aprobate si resync-ul aferent.
- CON-021: audit complet a11y, focus, Escape si viewports mobile.
