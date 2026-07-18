# ETAPA 10A.1A - diagnostic Playwright webServer

Data: 2026-07-15. Mediu exclusiv local: `demo-fom-pontaj-e2e`.

## Captura si configuratie

Log complet: `artifacts/pontaj/10a/webserver-startup.log` (fara secrete). Comanda: `DEBUG=pw:webserver npx playwright test -c playwright.pontaj.config.ts tests/e2e/pontaj/resilience/external-failures.spec.ts --project=pontaj-vectors --workers=1`.

| Serviciu | Command / cwd | Readiness | Timeout | Rezultat |
|---|---|---|---|---|
| Firebase | `node tests/e2e/pontaj/infrastructure/start-emulators.mjs`, cwd `/private/tmp/fom-pontaj-stage5-emulators` | `http://127.0.0.1:8080/` | 120 s | Firestore, Auth, Storage, Functions si Pub/Sub pornesc pentru `demo-fom-pontaj-e2e`. |
| Next | `node tests/e2e/pontaj/infrastructure/start-next.mjs`, cwd repo | `http://127.0.0.1:3100/login` | 300 s | build Next, apoi `next start --hostname 127.0.0.1 --port 3100`; readiness 200. |

Logul arata explicit `WebServer available` pentru Firebase, apoi pentru Next; setup Auth trece. Prin urmare, eroarea curenta nu este `READY_URL_MISMATCH`, `NEXT_BUILD_MISSING`, `ENV_PROPAGATION_BUG` sau `LAUNCHER_PREMATURE_EXIT`.

## Cauza identificata si corectie

Clasificare: `CHILD_PROCESS_SIGNAL_BUG`, remediat local in `start-emulators.mjs`.

Varianta cu `detached: false` trimitea SIGTERM doar procesului Firebase parinte. O rulare verde lasa Java Pub/Sub pe `127.0.0.1:8085` (PID diagnostic `9304`), ceea ce producea ulterior `PORT_CONFLICT`. Launcherul porneste din nou Firebase intr-un process group dedicat (`detached: true`) si la SIGINT/SIGTERM transmite semnalul grupului `process.kill(-child.pid, signal)`, cu fallback si escaladare doar dupa cinci secunde.

Procesul orphan existent a fost oprit diagnostic; nu a fost un proces IDE.

## Rezultate de diagnostic

| Varianta | Rezultat |
|---|---|
| A. Playwright Firebase, Next manual | neexecutata separat: configuratia normala a demonstrat ambele servicii ready; nu s-au pastrat configuratii temporare. |
| B. Playwright Next, Firebase manual | neexecutata separat: idem. |
| C. Ambele manual, fara webServer | neexecutata separat; nu era necesara dupa captura completa D. |
| D. Configuratia normala | startup PASS; setup Auth PASS; testul a fost executat. |

Testul complet `external-failures.spec.ts` nu a esuat la webServer: primul caz a atins timeout la `getByRole('button', { name: 'Cerere' })`. Este un rezultat functional RES-003 separat, neschimbat in aceasta subetapa.

## Stabilitate si teardown

Comanda repetata de doua ori: `npx playwright test -c playwright.pontaj.config.ts tests/e2e/pontaj/resilience/external-failures.spec.ts --project=pontaj-vectors --workers=1 --grep 'storage respins'`.

Ambele rulări: PASS. Dupa fiecare: niciun proces `firebase`, `next-server`, `playwright` sau `cloud-pubsub-emulator`; porturile `3100`, `8080`, `8085`, `9099`, `9199` libere. `git diff --check`: PASS.

Nu s-a accesat Firebase live, nu s-a făcut deploy, nu au fost modificate teste funcționale, aplicația sau rules in aceasta subetapa.
