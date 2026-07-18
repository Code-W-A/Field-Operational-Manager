# Deploy final pe proiectul curent

Data inchiderii: 2026-07-17. Commit de baza: `fe6e95b`; branch: `8iulie`.

## Identitate si target

- cont Firebase CLI: `nrgsistemedeacces@gmail.com`;
- project ID explicit: `field-operational-manager` (`11742701463`);
- Functions region: `europe-west1`;
- marker deploy: `ALLOW_CURRENT_FIREBASE_PROJECT_DEPLOY=true`;
- Vercel project ID: `prj_jLaPZFy3uf8oXVbvK6wI7HAu9is4`;
- Vercel team: `team_CkEgucAfUXuHSI0WXu5jkZWN` (`shik-projects`).

`firebase projects:list` si `firebase functions:list --project field-operational-manager` au trecut. Blocajul CLI istoric este rezolvat la autentificarea cu contul de mai sus. `firebase login:list` a identificat acelasi cont, dar procesul a iesit cu cod 2 din cauza timeoutului verificarii de update CLI; listarea proiectului si Functions a confirmat autorizarea efectiva.

## Firebase publicat

Comanda guardata a publicat exclusiv:

- `firestore:rules`;
- `storage` (Storage Rules);
- `functions:onAttendanceCheckoutSync`;
- `functions:onHrRequestApproved`;
- `functions:onHrRequestCreatedEmail`;
- `functions:onHrRequestStatusChangedEmail`;
- `functions:sendHrRequestPendingApprovalReminders`;
- `functions:runGenerateScheduledWorks`.

Nu s-a publicat Firebase Hosting. Rezultat: 6 Functions actualizate, 0 erori, 0 operatii abandonate. Hash Functions: `f55b00375fdc609151d8bf0bc48d2d3db3459f9f`.

Rules releases:

- Firestore: `3cb1ad2d-9d89-4f0e-811a-c89db042c0a4`;
- Storage: `c6601a27-205c-4857-9ffa-e9ff069e631b`.

Rules open sunt active conform deciziei proprietarului. Backupurile restrictive sunt pastrate. Endpointul `/api/notifications/hr-request` ramane autentificat/autorizat server-side, iar callable-ul `runGenerateScheduledWorks` ramane admin-only.

## Vercel Preview

Deployment final: `dpl_7EjWdaGV5nQQNze7bCNffjgnH7Jp`, target confirmat `preview`, status `Ready`:

`https://v0-field-operational-manager-kzil557sw-shik-projects.vercel.app`

Configuratie izolata: `APP_DEPLOYMENT_ENV=preview-test`, `MAIL_TRANSPORT_MODE=sink`, allowlist `.invalid`, CRM inbox/Sent copy/reverse geocode dezactivate. SMTP real nu poate fi construit in acest mod. Aliasul Production `fom-nrg.vercel.app` nu a fost schimbat si nu a existat `--prod`.

Automation bypass-ul temporar a fost revocat dupa smoke; proiectul are 0 bypass entries si SSO protection a ramas activa.

Verificarea finala a aliasului public a confirmat deploymentul Production preexistent `dpl_6DdpXXsgXko7diysfNCFne2U2BHs`, creat la 2026-07-13. Deploymentul Preview final are alt ID si nu a inlocuit acest alias.

Observatii neblocante: runtime-ul Functions Node.js 20 este marcat deprecated de platforma, iar `firebase-functions` 4.9 este vechi. Outputul diagnostic Firebase CLI a inclus valori Runtime Config; acestea nu au fost copiate in repository sau documentatie, iar rotirea credentialului SMTP este recomandata ca precautie operationala.
