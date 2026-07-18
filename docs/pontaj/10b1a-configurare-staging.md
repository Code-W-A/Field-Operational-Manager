# ETAPA 10B.1A - configurare staging

Sablonul canonic este `.env.staging.example`. Valorile de identitate sunt intentionat goale; nu exista un project ID staging confirmat.

## Schema obligatorie

- Identitate: `APP_DEPLOYMENT_ENV=staging`, `NEXT_PUBLIC_APP_ENV=staging`, `STAGING_MARKER=true`, `VERCEL_ENV=preview`.
- Firebase: target explicit, project ID public identic, API key publica, Auth domain, Storage bucket, app ID, sender ID.
- Functions: regiune si base URL care contin proiectul staging.
- Aplicatie: URL HTTPS staging, diferit de `fom-nrg.vercel.app`.
- Email: `MAIL_TRANSPORT_MODE=disabled|sink`; sink cere `MAIL_SINK_ALLOWED_DOMAINS`. SMTP si credentialele SMTP sunt interzise.
- Servicii externe: `REVERSE_GEOCODE_MODE=disabled` pana la aprobare.
- E2E browser controls: `NEXT_PUBLIC_E2E_ENABLED=false`.
- Guard: denylist productie, allowlist staging explicita, commit aprobat si worktree curat.

## Vercel staging

Administratorul creeaza sau identifica proiectul/mediul Vercel staging, leaga numai branchul si commitul aprobate si configureaza variabilele de mai sus in scope Preview/Staging. Valorile se introduc in Vercel/secret manager, nu in repo. Mapping-ul trebuie verificat inainte de orice build sau deploy extern.

## Preflight

`npm run preflight:staging` valideaza local configuratia, nu executa deploy. Refuza target gol sau alias, productia, proiect neallowlistat, domeniu/bucket/Functions incompatibile, SMTP, servicii externe active, commit neaprobat si worktree murdar. Allowlist-ul ramane gol pana la provisioning.

SMTP in Firebase Functions cere explicit `APP_DEPLOYMENT_ENV=production` si `MAIL_TRANSPORT_MODE=smtp`; staging si valorile lipsa sunt fail-closed. Pentru staging se recomanda initial `disabled`. Un sink poate fi activat numai dupa aprobarea domeniilor complet izolate.

