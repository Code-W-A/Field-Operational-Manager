# Emailul procesului-verbal de instalare

Finalizarea din Expo (`/api/mobile/commands`, `installation` / `complete`) și din web (`/api/lucrari/[id]/installation`, `complete`) folosește `sendInstallationCompletion` în Next.js.

Tranzacția de finalizare creează documentul semnat și o singură operație `mobileEffects/installation-completion_{rootWorkId}`. Cererile repetate sau simultane folosesc aceeași operație. Documentele istorice fără `deliveryEffectId` nu sunt trimise retroactiv.

PDF-ul este generat pe server din snapshot-ul semnat, cu fonturile locale și logo NRG. Destinatarii provin din rezolvarea curentă a destinatarilor de raport; adresele istorice nu sunt preluate. Trimiterea SMTP refolosește `/api/send-email`, inclusiv câte un mesaj per destinatar, jurnalul emailurilor și copia Sent.

`delivery` este independent de finalizarea documentului:

- `pending` / `processing`: trimitere în așteptare / în curs;
- `sent`: transportul a confirmat trimiterea;
- `simulated`: PDF-ul și destinatarii au fost verificate, evenimentul este înregistrat prin transportul izolat; fără SMTP;
- `failed`: pregătirea sau configurarea a eșuat înaintea tentativei SMTP;
- `uncertain`: tentativa SMTP ori salvarea rezultatului nu poate fi confirmată. O procesare abandonată peste cinci minute este afișată tot ca incertă.

Nici `failed`, nici `uncertain` nu sunt reluate automat. Finalizarea și semnăturile rămân salvate. Verificați operația și `emailEvents` înaintea oricărei retrimiteri operate separat.

Verificări locale:

```sh
node --import tsx --test lib/installations/delivery.test.ts lib/pdf/installation-render.test.ts lib/work-documents/current-ticket-recipients.test.ts lib/work-documents/report-resend.test.ts
FIRESTORE_EMULATOR_HOST=127.0.0.1:8189 node --import tsx --test lib/installations/service.test.ts
```

Testul integrat folosește exclusiv proiectul emulator `demo-fom-installation` și transportul `sink` cu `example.invalid`. Nu trimite emailuri reale.
