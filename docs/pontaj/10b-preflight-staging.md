# ETAPA 10B - preflight staging

Data: 2026-07-17. Preflight executat read-only. Nu s-a facut deploy si nu s-a creat sau modificat nicio resursa Firebase.

## Identificarea mediilor

| Proprietate | Staging | Productie | Dovada |
|---|---|---|---|
| Project ID | NECONFIRMAT | `field-operational-manager` | `.firebaserc` si `.env` declara numai productia. `firebase projects:list --json` a returnat sapte proiecte fara un proiect FOM identificabil. |
| App URL | NECONFIRMAT | `https://fom-nrg.vercel.app` | `.env`; URL public verificat read-only. |
| Auth domain | NECONFIRMAT | `field-operational-manager.firebaseapp.com` | `.env`. |
| Firestore database | NECONFIRMAT | `(default)` din `field-operational-manager` | configuratia Firebase client/Admin. |
| Storage bucket | NECONFIRMAT | `field-operational-manager.firebasestorage.app` | `.env`. |
| Functions base URL | NECONFIRMAT | proiect productie, regiune `europe-west1` | `lib/firebase/config.ts` si `firebase-functions/src/index.ts`; endpointul nu a fost invocat. |
| Hosting/Vercel | NECONFIRMAT | `fom-nrg.vercel.app` | `.vercel/project.json` exista, dar `vercel project inspect` si `vercel env ls` refuza legatura locala invalida. |
| SMTP/notificari | NEIZOLAT/NECONFIRMAT | configuratie prezenta, valori redactate | `.env` contine configuratie SMTP/IMAP; Functions si ruta HR pot apela SMTP. |
| Reverse geocode | NEIZOLAT/NECONFIRMAT | Nominatim/OpenStreetMap | `app/api/reverse-geocode/route.ts`. |
| Conturi de test | LIPSA DOVADA | niciun cont live folosit | nu exista manifest sau credentiale dedicate 10B. |

## Dovada de separare

Criteriile obligatorii nu sunt indeplinite: lipsesc project ID, bucket, Auth domain, Functions endpoints, URL, variabile Vercel si conturi dedicate pentru staging. Niciunul dintre proiectele Firebase vizibile nu poate fi tratat drept staging doar pe baza numelui.

Clasificare principala: `STAGING_PROJECT_NOT_IDENTIFIED_BLOCKING`.

Blocaje suplimentare:

- `EXTERNAL_TRANSPORT_NOT_ISOLATED_BLOCKING`: SMTP/IMAP este configurat, fara sink sau kill-switch staging demonstrat.
- `VERCEL_ENVIRONMENT_MAPPING_MISSING_BLOCKING`: legatura locala Vercel nu poate fi inspectata.
- `STAGING_TEST_ACCOUNTS_MISSING_BLOCKING`: nu exista conturi E2E staging demonstrate.
- `DEPLOY_GUARD_STAGING_UNCONFIGURABLE_BLOCKING`: guardul existent accepta doar Emulator `demo-*`; nu exista un ID staging confirmat care sa poata intra intr-o allowlist stricta.
- `DEPLOY_SOURCE_NOT_IMMUTABLE_BLOCKING`: branchul local este `8iulie`, commit `fe6e95b8b6904611497349e6654c1387c34a6426`, iar worktree-ul contine modificari necomise.

## Decizie fail-closed

Nu s-au executat snapshot/deploy/rollback staging, teste mutante, Admin SDK extern, seed, Rules probes staging sau Functions staging. Nu s-a folosit aliasul implicit `default`, care rezolva explicit la productie.

Pentru deblocare sunt necesare, dintr-o sursa administrativa verificabila: project ID staging, URL staging, bucket/Auth/Functions staging, mapping Vercel, conturi dedicate si dovada tehnica a dezactivarii transporturilor externe. Abia apoi poate fi creat guardul care accepta exact acel project ID.
