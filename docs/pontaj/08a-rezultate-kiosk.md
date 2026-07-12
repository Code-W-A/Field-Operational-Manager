# ETAPA 8A - rezultate kiosk

## Verdict curent

`KIOSK_AUTOMATED_COMPLETE_WITH_DECLARED_MANUAL_AND_BUSINESS_BLOCKERS`

Toate cazurile automate KSK-001--KSK-014 sunt implementate. KSK-009 ramane un blocaj de politica de business, iar KSK-014 are limite fizice care nu pot fi demonstrate de Playwright.

## Acoperire inchisa

| ID | Status | Dovezi automate |
|---|---|---|
| KSK-001 | IMPLEMENTED_PASSING | Rosterul include numai tehnician, admin si dispecer asociati HR eligibil. |
| KSK-002 | IMPLEMENTED_PASSING | Deduplicare UID, sortare stabila si selectare omonim prin UID. |
| KSK-003 | IMPLEMENTED_PASSING | Inactiv, asociere incompleta si rol neeligibil sunt excluse. |
| KSK-004 | IMPLEMENTED_PASSING | UI: loading, empty, timeout, mesaj eroare, Retry si zero scrieri. Unit: reject/retry pentru `hrEmployees` si pentru fiecare query `users/{tehnician,admin,dispecer}`. |
| KSK-005 | IMPLEMENTED_PASSING | Start: attendance, lock, selfie Storage, audit, fara timesheet si refresh. |
| KSK-006 | IMPLEMENTED_PASSING | Stop: completed, lock sters, selfie, timesheet, audit si refresh. |
| KSK-007 | IMPLEMENTED_PASSING | Dialogurile pentru sesiune activa/absenta si anularea nu scriu date nepermise. |
| KSK-008 | IMPLEMENTED_PASSING | Sambata, duminica si sarbatoare: Cancel este no-op; Confirm persista snapshot si rezista refreshului. |
| KSK-009 | IMPLEMENTED_PASSING_WITH_BUSINESS_GAP | Caracterizarea confirma ca flagul individual este `false`; parola kiosk este ceruta numai la logout. |
| KSK-010 | IMPLEMENTED_PASSING | Fake camera, permission denied, media absenta, GPS denied/timeout, Storage failure, offline pre-commit, retry/reconnect si non-duplicare post-commit. |
| KSK-011 | IMPLEMENTED_PASSING | Doi utilizatori consecutivi au attendance si selfie path distincte. |
| KSK-012 | IMPLEMENTED_PASSING | Start si Stop simultan converg la o sesiune completed si o intrare timesheet. |
| KSK-013 | IMPLEMENTED_PASSING | Parola kiosk gresita/corecta, Cancel, Escape, X, dublu-submit, UI disabled in verificare, reset context si lipsa parolei din DOM. |
| KSK-014 | IMPLEMENTED_PASSING_WITH_MANUAL_HARDWARE_GAP | Companion Playwright portrait/landscape si interactiuni touch simulabile; hardware-ul ramane manual. |

## Corectii aplicate

- `components/attendance/kiosk-check-in.tsx`: logout-ul trateaza Escape corect, previne submitul dublu si are timeout explicit de 10 secunde pentru upload selfie Storage.
- `app/kiosk/page.tsx`: incarcarea rosterului are timeout de 10 secunde, stari loading/error/empty si Retry.
- `storage.rules`: fallback-ul invalid care apela `matches` pe path a fost corectat; `DEF-SEC-002` ramane deschis pentru restrangerea autorizarii.

## Executii confirmate in aceasta etapa

| Verificare | Rezultat |
|---|---|
| KSK-004 tinta | 4/4 PASS |
| Unitare loader roster | 4/4 PASS |
| KSK-010 camera/Storage si KSK-012 tinta | 4/4 PASS |
| KSK complet | 22/22 PASS dupa ultimele corectii de test. |
| Core RT/STA/STO/SYN + production-boundary/emulator-stack | 74/74 PASS. |
| Unitare relevante | 23/23 PASS. |
| Regresie istorica | Prima rulare: 106/107 PASS; CAL-V01 a esuat numai pe toast tranzitoriu. Dupa asertiune persistenta, rerulare V01: 2/2 PASS. Nu s-a facut inca o rerulare atomica a tuturor celor 107 dupa aceasta corectie. |

## Date si siguranta

- Testele folosesc numai Auth, Firestore, Functions si Storage Emulator cu proiectul `demo-fom-pontaj-e2e`.
- Seed kiosk: kiosk auth, tehnician, admin, dispecer, departament, program `08:00-16:30`, pauza `12:30-13:00` si zi goala; extra utilizatori doar in cazurile necesare.
- Nu s-a accesat, modificat sau deployat Firebase live.
- Media falsa este activata numai prin `PONTAJ_KIOSK_FAKE_MEDIA=true`; nu intra in aplicatie sau bundle production.

## Limite declarate

- `KSK-009 / BLK-006`: nu exista o decizie business pentru parola individuala a salariatului; nu s-a inventat o politica.
- `KSK-014`: camera fizica, GPS fizic, touch real, rotatie dispozitiv si permission prompts OS necesita checklist manual pe dispozitiv kiosk.
- Oprirea emulatorului poate raporta timeout pentru un trigger deja in curs. Nu a schimbat rezultatele testelor Playwright trecute.
