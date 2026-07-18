# Etapa 9B - defecte rapoarte

## DEF-REP-001 - graficul folosea durata bruta

Stare: REMEDIAT. `TimesheetCharts` calcula anterior `cell.hours`, in timp ce KPI-ul calcula intervalele efective. Graficul foloseste `buildTimesheetChartRows`, bazat pe `getTimesheetCellMinutes` si pauza configurata. Regresie: `components/hr/timesheet-charts.test.ts` si REP-001.

## FIXTURE-REP-004 - fixture stale care afecta REP-002

Stare: REMEDIAT. Izolarea fixture-ului prin `resetHrFixture` elimina salariatul partial si documentele precedente inainte de scenariul de proiectie. A fost `FIXTURE_BUG`, nu `APP_BUG` si nu defect de formula.

## Caracterizari declarate

- REP-006: C6/C7 folosesc suma bruta a intrarilor Pontaj pentru weekend/sarbatoare, iar prezenta foloseste union. Ramane `IMPLEMENTED_CHARACTERIZATION`.
- REP-008: erorile unor abonari ajung in consola, fara contract UI complet error/retry. Ramane `CHARACTERIZATION_DEF_UX_NON_BLOCKING`.
- `OvertimeReport` permite anul complet sau o singura luna; nu exista selector de interval arbitrar.
