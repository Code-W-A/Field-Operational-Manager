# Decizie finala: proiect curent si Rules open

Data: 2026-07-17. Decizia ownerului inlocuieste cerinta istorica pentru Firebase/Vercel staging separat. Tinta unica autorizata este Firebase `field-operational-manager` si proiectul Vercel existent.

`firestore.rules` este `FIRESTORE_OPEN_BY_OWNER_TEMPORARY`, iar `storage.rules` este `STORAGE_OPEN_BY_OWNER_TEMPORARY`. Ambele permit anonim read/write pe toate resursele. Configuratia este intentionat nesigura si nu reprezinta un security pass.

Regulile restrictive sunt arhivate in `docs/pontaj/security/firestore-rules-restrictive-backup.rules` si `docs/pontaj/security/storage-rules-restrictive-backup.rules`. Testele restrictive sunt pastrate opt-in cu `@security-hardening` si status `SECURITY_HARDENING_DEFERRED_BY_OWNER`.

Probe locale anonime au confirmat create/read/update/delete Firestore si upload/download/overwrite/delete Storage pe path aleator: `OPEN_RULES_CONFIGURATION_CONFIRMED`. Autorizarea server-side a rutei HR si a callable-ului ramane activa in cod, independent de Rules.

Rules open au fost compilate si testate numai pe Emulator. Nu au fost publicate in proiectul curent deoarece identitatea Firebase CLI nu are acces la tinta.
