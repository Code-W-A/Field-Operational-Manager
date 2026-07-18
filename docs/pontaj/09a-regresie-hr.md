# ETAPA 9A - regresie HR

Executat local, exclusiv Emulator Suite:

| Comanda / familie | Rezultat |
| --- | --- |
| `crud.spec.ts` + `departments.spec.ts` | PASS, 6 teste aplicative plus setup Auth. |
| `profile-photo.spec.ts` | PASS, 1 test aplicativ plus setup Auth. |
| `defaults.spec.ts` | PASS in rularea familiei HR de verificare anterioara. |
| `list.spec.ts` | PASS in rularea tintita dupa implementarea cautarii. |
| `profile.spec.ts` | PASS tintit dupa corectia loading/error pentru profil. |
| `defaults-attendance.spec.ts` | PASS tintit: snapshot program/pauza vechi si defaults noi pentru Start nou. |
| `dispatcher.spec.ts` | PASS tintit: caracterizarea accesului dispecer. |
| `managers-minimal.spec.ts` + `managers.spec.ts` | PASS, 2 teste aplicative plus setup Auth: maparea este inlocuita exact si ramane corecta dupa refresh. |

## ETAPA 9A.1C - executie unificata

La 2026-07-13 s-a rulat:

```text
npx playwright test -c playwright.pontaj.config.ts tests/e2e/pontaj/salariati tests/e2e/pontaj/infrastructure/production-boundary.spec.ts --project=pontaj-vectors
```

Rezultat: **20 PASS** (1 setup Auth + 19 cazuri aplicative), pe `demo-fom-pontaj-e2e`. Include HR-001--HR-013, contractele de dialog si production boundary. Build-ul Functions si build-ul Next.js au trecut ca parte din web server-ul Playwright.

Acoperire noua: HR-007 verifica luni de 28/29/30/31 zile, refresh/back/forward, profil partial, departament sters, asociere lipsa si excluderea traseului din ore; HR-013 verifica operatiile de salariat ale dispecerului si refuzul UI pentru departamente; contractele de dialog verifica focus modal, Tab/Shift+Tab, Escape, X, click exterior, reset draft, snapshot defaults, preview foto, confirmare si viewport mobil.

Nu executat in aceasta runda: regresiile Condica, Kiosk, Core si istoric solicitate de etapa 9A.1C, cleanup dublu si lint. Prin urmare nu exista pretentie de regresie completa cross-module.

Firebase live a ramas neaccesat; proiectul de test este `demo-fom-pontaj-e2e`.

## ETAPA 9A.1D - gate final

ETAPA 9A.2C confirma Requests **12 PASS**, HR unificat **30 PASS**, Condica **35 PASS**, Kiosk cu fake media **23 PASS**, Core complet **76 PASS** cu **72/72** cazuri logice, istoric atomic **107 PASS**, unitare relevante **66 PASS**, buildurile si cleanup-ul dublu `remaining: {}`. Diferenta istorica 74/75 este reconciliata: 74 omitea STO-002/003, iar 75 era metadata inconsistentă. Detalii: `09a2c-reconciliere-core-74-75.md`.
