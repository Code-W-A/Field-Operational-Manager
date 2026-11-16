# Atașamente la emailurile ofertelor

CRM și editorul ofertelor din tichete folosesc `EmailAttachmentsField`. Fișierele sunt trimise ca atașamente MIME, după PDF-ul generat al ofertei. Maximum 10 fișiere suplimentare, 10.000.000 octeți/fișier și 15.000.000 octeți cumulat cu PDF-ul (înainte de codificarea MIME). Formate: PDF, JPEG, PNG, WebP, GIF, TIFF, BMP, DOC/DOCX, XLS/XLSX, DWG/DXF și ZIP.

## Persistență și acces

- `emailAttachments` conține `{ id, filename, size, contentType }[]` pe documentele `crm_offers`, pe tichet și în `offerVersions`/`offerActionSnapshot`. Documentele vechi fără câmp se comportă ca o listă goală.
- `POST /api/offer/attachments` primește `{ action: "initiate", context: { kind: "crm" | "ticket", id }, filename, size }`, apoi `{ action: "finalize", context, id }`. Rolurile verificate sunt admin/dispecer, iar CRM verifică suplimentar drepturile asupra oportunității.
- Încărcarea este directă prin Firebase Storage SDK, pe `offer-email-attachments/{uid}/{id}`, pe baza unui permis server valabil 10 minute în colecția `offerEmailAttachments`. Obiectele nu pot fi suprascrise sau citite direct de client. Finalizarea verifică dimensiunea și tipul și reține generația obiectului.
- `GET /api/offer/attachments?kind=crm|ticket&contextId=...&id=...` verifică accesul și returnează fișierul pentru descărcare. Nu există URL-uri publice în draft.
- Serverul reconstruiește metadatele din registru, verifică asocierea și totalul real și citește generația salvată înainte să trimită emailul. Un PDF absent, un fișier lipsă sau o referință străină opresc trimiterea.
- Eliminarea din selecție și ștergerea unui draft nu șterg obiectele Storage, deoarece versiuni istorice le pot referi. Încărcările abandonate sunt păstrate; nu este introdus un proces automat de ștergere.
- Oferta nouă CRM golește selecția; încărcarea unui draft și reutilizarea explicită a unei oferte o restaurează. În tichete, salvarea creează o versiune și include modificările atașamentelor în detectarea diferențelor.

## Publicare

Implementarea necesită publicarea regulilor `firestore.rules` și `storage.rules` împreună cu aplicația web. Publicați regulile înaintea aplicației: registrul trebuie să fie exclus din regulile generale Firestore, iar directorul Storage din regula generală de acces. Nu sunt necesare migrarea documentelor vechi sau schimbări la aplicația Expo. Nicio publicare nu este efectuată de testele de mai jos.

## Verificare locală

- `npx tsx --test lib/offer/email-attachments.test.ts lib/crm/offer-routes.test.ts lib/work-documents/ticket-offer-validation.test.ts`
- `npx tailwindcss -i app/globals.css -o /tmp/fom-attachments-browser.css --minify`, apoi `node scripts/test-offer-attachments-browser.mjs`. Testul rulează editoarele reale cu servicii simulate, fără Firebase/SMTP live; capturile sunt `/tmp/fom-attachments-crm.png` și `/tmp/fom-attachments-ticket.png`.
- `PLAYWRIGHT_CHANNEL=chrome node scripts/test-work-document-recipient.mjs` verifică regresiile destinatarilor și validărilor existente.
- Pentru regulile Firebase, copiați regulile într-un director temporar și configurați emulatoarele Auth, Firestore și Storage; rulați `firebase --project demo-fom-attachments emulators:exec --only auth,firestore,storage 'node /cale/absolută/next-js/scripts/test-offer-attachment-rules.mjs'`. Scriptul refuză adrese non-locale și verifică încărcare validă, dimensiune/tip, expirare, proprietar, suprascriere, citire/ștergere directă și falsificarea registrului.

Testele simulate nu demonstrează livrarea în Inbox sau compatibilitatea limitelor serverului SMTP de producție.
