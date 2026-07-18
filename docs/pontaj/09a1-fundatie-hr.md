# ETAPA 9A.1 - fundatie HR

Executie: 2026-07-13, exclusiv `demo-fom-pontaj-e2e` cu Firebase Emulator Suite. Firebase live, staging si deploy nu au fost utilizate.

| Caz | Stare | Fisier | Ultima executie | Defect |
| --- | --- | --- | --- | --- |
| HR-001 | IMPLEMENTED_PASSING | `salariati/list.spec.ts` | executie 9A anterioara | DEF-HR-002 remediat |
| HR-002 | IMPLEMENTED_PASSING | `salariati/crud.spec.ts` | executie 9A anterioara | DEF-HR-001 characterization |
| HR-003 | IMPLEMENTED_NON_BLOCKING | `salariati/crud.spec.ts` | executie 9A anterioara | DEF-HR-005 business gap |
| HR-004 | IMPLEMENTED_PASSING | `salariati/crud.spec.ts` | executie 9A anterioara | - |
| HR-005 | IMPLEMENTED_PASSING | `salariati/managers-minimal.spec.ts`, `salariati/managers.spec.ts` | PASS 2026-07-13 | DEF-HR-007 remediat |
| HR-006 | IMPLEMENTED_PASSING | `salariati/profile-photo.spec.ts` | executie 9A anterioara | - |
| HR-007 | PARTIAL | `salariati/profile.spec.ts` | PASS tintit 2026-07-13 | loading/error si cazurile principale verificate; matricea completa nu este rulata |
| HR-008 | IMPLEMENTED_PASSING | `salariati/defaults.spec.ts` | executie 9A anterioara | - |
| HR-009 | IMPLEMENTED_PASSING | `salariati/defaults.spec.ts` | executie 9A anterioara | - |
| HR-010 | IMPLEMENTED_PASSING | `salariati/defaults-attendance.spec.ts` | PASS tintit 2026-07-13 | DEF-HR-008 remediat |
| HR-011 | IMPLEMENTED_PASSING | `salariati/departments.spec.ts` | executie 9A anterioara | - |
| HR-012 | IMPLEMENTED_PASSING | `salariati/departments.spec.ts` | executie 9A anterioara | - |
| HR-013 | IMPLEMENTED_CHARACTERIZATION | `salariati/dispatcher.spec.ts` | PASS tintit 2026-07-13 | BUS-01 nedefinit |

## Matrice HR-013 observata

| Operatie dispecer | UI | Direct URL | Firestore Read | Firestore Write | Rezultat |
| --- | --- | --- | --- | --- | --- |
| Lista salariați | vizibil | permis | permis in emulator | - | caracterizare PASS |
| Creare salariat | vizibil/enabled | permis | - | permis in emulator | caracterizare PASS |
| Departamente | refuzat | refuzat | neverificat separat | neverificat separat | UI refuza |

Aceasta nu este o politica aprobata. `firestore.rules` necesita decizie separata deoarece regulile actuale nu exprima restrictia UI.

## Verdict

`HR_FOUNDATION_EXECUTABLE_INCOMPLETE`

Motiv: HR-007 si HR-013 sunt inca partiale, iar contractele complete ale dialogurilor si regresia unificata nu sunt executate.
