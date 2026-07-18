# Rezultate Preview

Run ID: `e2e-live-final-20260717T194732Z-05937110`.

Preview: `https://v0-field-operational-manager-kzil557sw-shik-projects.vercel.app`.

| Proba externa | Rezultat |
|---|---|
| A. URL/login/static/page errors | PASS: HTTP 200, resurse statice, 0 `pageerror` |
| B. Auth | PASS: admin sintetic, rol Administrator, logout, numai cont sintetic modificat |
| C. Firestore open | PASS: create/read/update/delete anonim pe document unic |
| D. Storage open | PASS: upload/download/overwrite/delete anonim pe path unic |
| E. Endpoint HR | PASS: anonim 401, fara relatie 403, owner/admin/manager permis, injectie 400, replay si concurenta |
| F. Callable | PASS: anonim/tehnician refuzat, admin permis cu `{ created: 0 }`, injectie refuzata |
| G. Flux minim | PASS: Start, Stop, lock eliminat, timesheet, cerere, aprobare, CO, export CSV |

Attendance extern: `att_livefinal-20260717-05937110-tech_1784322210437`. Stop-ul a produs `status=completed`, `sessionEnd`, eliminarea lock-ului si documentul lunar `e2e-live-final-20260717-05937110-employee_2026-07`. Cererea sintetica a fost aprobata si proiectata ca `days.23.code=CO`.

Endpointul HR a rulat cu sink limitat la `.invalid`: zero `emailEvents` pentru cererile probei, zero SMTP real, zero SMS si zero push. Callable-ul a folosit un contract inexistent din manifest si nu a modificat niciun contract real.

Defect remediat in timpul preflightului: allowlist-ul `.invalid` era comparat literal si respingea `example.invalid`. Verificarea accepta acum sufixele configurate cu punct initial; regresia unitara este 4/4 PASS. Ajustarile ulterioare au fost exclusiv ale runnerului: shell SSR hidratat, header Vercel limitat la hostul Preview, dialog selfie asincron si date HR nesuprapuse.

Dovezi:

- `artifacts/pontaj/final/e2e-live-final-20260717T194732Z-05937110/manifest.json`;
- `artifacts/pontaj/final/e2e-live-final-20260717T194732Z-05937110/smoke-results.json`.
