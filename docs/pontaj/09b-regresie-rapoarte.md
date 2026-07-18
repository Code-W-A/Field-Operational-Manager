# Etapa 9B - regresie rapoarte

Executii finale confirmate dupa corectia fixture-ului REP-002:

| Selectie | Rezultat |
| --- | --- |
| Reports + setup + production-boundary | 14/14 PASS |
| HR + Requests + production-boundary | PASS |
| Condica + production-boundary | PASS |
| Kiosk + production-boundary | 23/23 PASS |
| Core RT/STA/STO/SYN + infrastructura | 72/72 cazuri logice, 76/76 Playwright PASS; include `stop-minimum.spec.ts` |
| Istoric atomic | 107/107 PASS |
| Unitare Reports | 45/45 PASS |
| Firebase Functions build | PASS |
| Next.js build | PASS, cu `typescript.ignoreBuildErrors` si `eslint.ignoreDuringBuilds` configurate |
| Live guard + production-boundary explicit | PASS |
| Cleanup dublu | `{"cleanupRuns":2,"remaining":{}}` |

Typecheck-ul global ramane FAIL din baseline istoric. Dupa eliminarea declaratiei duplicate din testul overtime, filtrarea fisierelor 9B nu are erori. Lint nu are configuratie ESLint neinteractiva; starea este `NOT_CONFIGURED_NON_BLOCKING`.

Inregistrarea anterioara care marca regresiile ca neexecutate este depasita de acest gate.
