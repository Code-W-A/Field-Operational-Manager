# ETAPA 10B - live read-only smoke

Productie declarata: `field-operational-manager`. URL: `https://fom-nrg.vercel.app`.

## Preflight pentru autentificare

Loginul reusit apeleaza `addAuthLog` si scrie un document in `logs`. Paginile HR apeleaza `seedHrIfEmpty` la mount; in build production seed-ul ar trebui sa fie inactiv, dar valoarea efectiva Vercel `NEXT_PUBLIC_DISABLE_HR_SEED` nu poate fi verificata din cauza legaturii Vercel invalide. Nu exista un cont live dedicat desemnat.

Clasificari:

- `LIVE_READ_ONLY_UNSAFE_BLOCKING` pentru smoke autentificat: loginul produce audit write.
- `LIVE_TEST_ACCOUNT_MISSING_NON_BLOCKING`: nu exista cont dedicat oferit pentru smoke.

Nu s-a efectuat autentificare si nu au fost accesate Dashboard, profil, Condica sau Reports.

## Smoke public executat

| Proba | Rezultat |
|---|---|
| `HEAD /` | 200, HTML Vercel/Next |
| `HEAD /login` | 200, HTML Vercel/Next |
| Browser `/login` | PASS, titlu `Field Operational Manager` |
| Formular public | email, parola, afisare parola, autentificare si resetare vizibile |
| Resurse statice esentiale | CSS, JS, fonturi, manifest si logo: 200 |
| Console/page errors | zero |
| Firebase/Functions/Storage requests pe pagina publica | zero observate |

Pagina publica apeleaza `DELETE /api/auth/session`; inspectia codului confirma ca raspunsul doar expira cookie-ul `__session` si nu citeste sau scrie Firebase. `favicon.ico` a raspuns 404, defect cosmetic neblocant.

Deploymentul public observat in URL-urile asseturilor: `dpl_6DdpXXsgXko7diysfNCFne2U2BHs`. Nu este demonstrata corespondenta acestuia cu commitul local.

Zero actiuni mutante in Firebase productie. Zero deploy productie.
