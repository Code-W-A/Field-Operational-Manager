# ETAPA 10B.1A - teste autorizare

Data: 2026-07-17. Toate probele au folosit Firebase Emulator Suite si proiectul `demo-fom-pontaj-e2e`.

| Gate | Rezultat |
|---|---:|
| Endpoint HR real, sink: anonim/client/rol necunoscut/fara rol/dispecer, owner, alt owner, admin/manager, payload strict, stare, replay si concurenta | 6 PASS (setup 1 + 5 teste) |
| Endpoint HR cu transport disabled: doua retry-uri 503, zero marker, zero `emailEvents`, request nemodificat | 2 PASS (setup 1 + 1 test) |
| Callable Emulator: anonim/tehnician refuzat, admin permis, input injectat refuzat | 3 PASS (setup 1 + 2 teste) |
| Unitare politica/autorizare ruta | 7 PASS |
| Unitare politica SMTP Functions + callable | 5 PASS |
| Unitare deploy guard | 3 PASS |
| Requests + boundary contractual | 12 PASS in cadrul rularii HR de 30 |
| HR foundation + Requests + boundary | 30 PASS |
| Rules/Storage/callable/RES-003/emulator guard/boundary | 15 PASS |
| RES-003 | 3 PASS in selectia combinata (setup + 2 cazuri) |
| Cleanup explicit | `{ "cleanupRuns": 2, "remaining": {} }` |

Firestore Rules: 4/4 PASS. Storage Rules: 3/3 PASS. Ambele fisiere au fost compilate de Emulator. Production-boundary a confirmat ca markerii si adaptoarele STO/CON nu apar in `.next`.

`npm run build` si `npm --prefix firebase-functions run build` sunt PASS. Typecheck-ul global ramane rosu din erori istorice din afara acestei subetape; filtrul fisierelor 10B.1A nu raporteaza erori. `git diff --check` este PASS.

Nu s-a apelat SMTP real: Next a folosit `sink`/`disabled`, Functions au avut mediul local fail-closed, iar recipientele sink au fost limitate la `e2e.invalid`. Sink-ul nu este persistent. Nu s-a accesat Firebase live si nu s-a facut deploy.

Guardul runtime cu allowlist neprovisionata a iesit intentionat cu refuz. Testele pure confirma separat refuzul pentru gol, alias, placeholder, productie si proiect necunoscut.

