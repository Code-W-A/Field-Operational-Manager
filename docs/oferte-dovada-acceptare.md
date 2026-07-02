# Oferte — Dovada trimiterii și acceptării

Document de referință pentru situații în care un client a primit oferta, a acceptat-o, dar contestă sau refuză plata.

---

## Implementat în FOM

### Unde apare în UI

| Locație | Ce vezi |
|---------|---------|
| **Tichet** → secțiune Ofertă → **Dosar ofertă** | Timeline + rezumat + export JSON/PDF |
| **CRM Oportunitate → Oferte** | Dosar agregat pe oportunitate + buton **Dosar** per ofertă emisă |

### Badge-uri timeline

- **Complet** — eveniment din colecția `offerEvents` (de la deploy înainte), cu IP/UA, hash snapshot, messageId etc.
- **Date limitate** — eveniment reconstruit din date vechi (`offerAudit`, `emailEvents`, câmpuri pe lucrare). Secțiunea „Indisponibil” listează ce lipsește (ex. IP, corp email).

### Export

- **JSON** — `GET /api/lucrari/{id}/offer-evidence?format=json`
- **PDF dosar** — proces verbal generat client-side din pack (nu înlocuiește PDF-ul ofertei)
- CRM: `/api/crm/opportunities/{id}/offer-evidence`, `/api/crm/offers/{offerId}/offer-evidence`

### Colectare viitoare (`offerEvents`)

Append-only, scris la fiecare pas: pregătire, token, email, link deschis, cod OTP, verificare, accept/refuz, reissue, confirmare.

Evenimentele noi includ și câmpuri de integritate:

- `eventHash` — hash SHA-256 al evenimentului normalizat
- `prevEventHash` — legătură cu evenimentul anterior al aceleiași entități
- `hashVersion` — versiunea algoritmului de hash
- `integrityWarning` — avertisment când lanțul nu poate fi legat complet

Pentru fluxul Lucrări, trimiterea ofertei transmite `lucrareId` explicit către API; dosarul nu mai depinde de `lucrareId` ascuns în atașamentul PDF. Emailul de confirmare post-accept/refuz este trimis și auditat server-side în `/api/offer/respond`; ruta veche client-side `/api/offer/confirmation-sent` nu mai creează evenimente de dovadă.

---

## Verificare punctuală — cerința „pipeline + PDF nou după accept/refuz”

### Verdict

Cerința este doar parțial implementată.

### Ce există deja

- În fluxul **Lucrări**, acceptul/refuzul se salvează în `offerResponse`, `offerResponsesHistory`, `acceptedOfferSnapshot`, `offerActionUsedAt` și apare în UI pe tichet plus în dashboard la box-ul `Status oferte`.
- În fluxul **CRM**, acceptul/refuzul mută explicit oportunitatea în pipeline prin `OFERTA_ACCEPTATA` / `OFERTA_REFUZATA` și scrie `STAGE_CHANGED`.
- Există deja un **PDF de dosar ofertă** separat, generat din `lib/offer/evidence-pdf.ts`, dar acesta este un proces verbal de audit, nu PDF-ul comercial al ofertei reemis după răspuns.

### Ce NU există acum

- În fluxul **Lucrări**, acceptul/refuzul nu setează un câmp de pipeline dedicat, similar cu CRM. În `app/api/offer/respond/route.ts` se actualizează `statusOferta`, dar nu există o tranziție explicită de tip `OFERTA_ACCEPTATA` / `OFERTA_REFUZATA`.
- PDF-ul comercial al ofertei generat de `lib/utils/offer-pdf.ts` nu conține niciun bloc de dovadă de tip „Oferta acceptată/refuzată la data...”.
- După accept/refuz nu există niciun flux care să regenereze și să urce automat un **nou PDF al ofertei** cu dovada răspunsului, nici pentru `Lucrări`, nici pentru `CRM`.
- Linkurile actuale din UI deschid fie PDF-ul original al ofertei, fie PDF-ul separat de dosar, nu un PDF reemis al ofertei cu mențiunea legală cerută.

### Concluzie practică

Pentru cerința formulată:

1. **CRM** are deja partea de pipeline, dar nu are PDF-ul reemis cu dovada de accept/refuz.
2. **Lucrări** nu are nici pipeline dedicat, nici PDF reemis cu dovada de accept/refuz.

### Plan de implementare propus

#### 1. Standardizare status pipeline pentru oferte în fluxul `Lucrări`

Adăugăm un câmp explicit, separat de `statusOferta`, de exemplu:

- `offerPipelineStage: "OFERTA_TRANSMISA" | "OFERTA_ACCEPTATA" | "OFERTA_REFUZATA"`

Actualizări:

- la trimiterea ofertei: `OFERTA_TRANSMISA`
- la accept: `OFERTA_ACCEPTATA`
- la refuz: `OFERTA_REFUZATA`

Motiv:

- `statusOferta` este folosit istoric și are valori neuniforme (`DA`, `OFERTAT`), deci nu e un suport bun pentru pipeline clar și raportare.

#### 2. Model de date pentru PDF-ul reemis cu dovada răspunsului

Pe `lucrari/{id}` și `crm_offers/{offerId}` adăugăm o structură dedicată, de exemplu:

```ts
responseCertifiedPdf: {
  action: "accept" | "reject"
  actedAt: string
  verifiedEmail: string
  sourceVersionSavedAt?: string
  renderedProofText: string
  pdfUrl: string
  pdfStoragePath: string
  pdfFilename: string
  generatedAt: string
}
```

Motiv:

- păstrăm PDF-ul original nemodificat
- salvăm separat documentul „certificat” rezultat după răspuns
- avem un punct unic de download și audit

#### 3. Extindere generator PDF ofertă

Extindem `OfferPdfInput` din `lib/utils/offer-pdf.ts` cu un bloc opțional:

```ts
responseProof?: {
  action: "accept" | "reject"
  actedAt: string
  verifiedEmail: string
  reason?: string
}
```

La randare:

- pe ultima pagină, deasupra footer-ului standard, se adaugă textul:
  `Oferta acceptata/refuzata la data de ZZ.LL.AAAA ora HH:MM de pe email sssddd@gmail.com`
- dacă nu mai este loc pe pagină, se adaugă automat o pagină nouă doar pentru blocul de dovadă
- pentru refuz, motivul poate fi pe linie separată când există

#### 4. Regenerare automată la accept/refuz

În:

- `app/api/offer/respond/route.ts`
- `app/api/crm/offers/respond/route.ts`

după salvarea răspunsului:

- reconstruim inputul PDF din snapshotul trimis/acceptat
- injectăm `responseProof`
- generăm noul PDF
- îl urcăm în storage
- salvăm metadatele în `responseCertifiedPdf`

Important:

- PDF-ul trebuie generat din snapshotul versiunii la care s-a răspuns, nu din editorul curent, ca să rămână probă fidelă

#### 5. UI și download

În UI:

- pe tichet și pe oferta CRM adăugăm link separat: `PDF ofertă cu dovada răspunsului`
- în `Dosar ofertă` afișăm și linkul către acest PDF
- în istoric se afișează statusul de generare: generat / lipsă / eșuat

#### 6. Compatibilitate cu datele existente

Pentru ofertele deja acceptate/refuzate:

- dacă avem snapshot + `offerResponse` / `response`, putem rula un backfill și genera PDF-urile retroactiv
- dacă lipsește snapshotul versiunii răspunse, nu regenerăm automat și marcăm cazul ca „nerecuperabil complet”

#### 7. Ordine recomandată de livrare

1. `Lucrări`: adăugare `offerPipelineStage` + generare PDF certificat după accept/refuz
2. `CRM`: aceeași generare PDF certificat, reutilizând același renderer
3. UI: linkuri dedicate + status generare
4. Backfill pentru cazurile istorice recuperabile

#### 8. Estimare pragmatică

- backend + model date + PDF renderer: `1-2 zile`
- integrare UI `Lucrări` + `CRM`: `0.5-1 zi`
- backfill + testare regresie: `0.5-1 zi`

Total realist: `2-4 zile dev`

---

## Context

Pentru a demonstra că un client a acceptat oferta, avem nevoie de:

1. **Oferta trimisă** — conținut complet, dată trimiterii, destinatar
2. **Acceptul** — când a venit, dată/oră, prin ce email a fost confirmat

Sistemul FOM are **două fluxuri paralele**:

| Flux | Unde se folosește | Unde caută datele |
|------|-------------------|-------------------|
| **Lucrări / Tichete** | Operațiuni teren, dashboard `/dashboard/lucrari/[id]` | Document `lucrari/{id}` + subcolecția `offerAudit` |
| **CRM Oportunități** | Vânzări, `/crm/opportunities/[id]` | `crm_offers`, `crm_activity_logs`, `crm_emails` |

Majoritatea tichetelelor de teren folosesc fluxul **Lucrări**. CRM are timeline integrat, dar audit portal mai slab decât la Lucrări.

---

# Plan 1 — Ce putem scoate ACUM (sistemul actual)

## Pas 0: Identifică fluxul

Înainte de orice, stabilește dacă oferta a fost emisă din **Tichet** sau din **CRM Oportunitate**. Sursele de date diferă.

---

## A. Dovada că oferta a fost TRIMISĂ

### Flux Lucrări (cel mai probabil)

| Sursă | Ce conține | Unde o găsești |
|-------|------------|----------------|
| `lastOfferEmail` | Data trimiterii, destinatari, status SMTP, `messageId` | Pagina tichetului → secțiune email |
| `emailEvents` (tip `OFFER`) | Subiect, destinatari, status, `messageId`, dată | Dashboard → **Loguri** → tab Email |
| `offerActionSnapshot` | Snapshot exact al ofertei trimise: produse, total, TVA, `savedAt` | Firestore pe documentul lucrării |
| `offerVersions[]` | Istoric versiuni salvate (dată, autor, total, linii) | UI → **Istoric ofertare** pe pagina tichetului |
| `offerPreparedBy` / `offerPreparedAt` | Cine a pregătit oferta și când | Document lucrare |
| `ofertaDocument` | PDF ofertă (dacă a fost generat/încărcat) | Buton „Vizualizează ofertă (PDF)” pe tichet |
| `logs` (categorie Email) | Acțiune „Trimitere ofertă” — tichet, destinatar, versiune | Dashboard → Loguri |

**Ce poți reconstrui pentru dosar:**

- Către cine s-a trimis (email)
- Când s-a trimis
- Ce conținea oferta (linii + total din snapshot/versiune)
- PDF-ul atașat (dacă există)
- Confirmare SMTP (`messageId`)

### Flux CRM

| Sursă | Ce conține |
|-------|------------|
| Document `crm_offers/{offerId}` | `snapshot` complet, `sentAt`, `recipientEmail`, `subject`, `pdfUrl`, versiune |
| `crm_activity_logs` tip `OFFER_SENT` | offerId, versiune, destinatar, subiect, total, link PDF |
| `crm_emails` | Email outbound cu subiect, from, to, snippet body |
| Timeline CRM | `/crm/opportunities/[id]/timeline` — vizual, cu date |

---

## B. Dovada că clientul a ACCEPTAT

### Flux Lucrări — cel mai puternic

Acceptarea este **verificată în 2 pași** (email + cod OTP), deci avem mai mult decât un simplu click.

| Sursă | Ce dovedește |
|-------|--------------|
| `offerResponse` | Status `accept`, **data/ora exactă** (`at`), email verificat (`verifiedEmail`) |
| `acceptedOfferSnapshot` | **Exact ce a acceptat** — aceleași linii ca la trimitere |
| `offerResponsesHistory[]` | Istoric complet: dată, email, versiune, hash proof |
| `offerActionVerification` | Lanțul OTP: `email`, `codeSentAt`, `verifiedAt`, `responseProofIssuedAt`, `responseProofUsedAt` |
| `offerActionUsedAt` | Momentul consumării linkului accept/refuz |
| `statusOferta = "OFERTAT"` | Status intern după accept |
| `lucrari/{id}/offerAudit` | Timeline tehnic (nu e în UI, doar Firestore) |
| `logs` (categorie „Portal ofertă”) | Aceleași evenimente, filtrabile după `lucrareId` |

**Evenimente în `offerAudit` (subcolecție Firestore):**

```
link-open          → clientul a deschis linkul din email
send-code          → a cerut cod pe email X
verify-code        → a introdus codul corect
respond-accept     → a confirmat acceptarea
```

**Pe UI (pagina tichetului) se vede deja:**

- Badge „Acceptată” + dată
- „Confirmată de către: {email}”
- **Istoric ofertare** — versiune + răspuns client cu dată și email
- Buton „Deschide versiunea acceptată în editor”

### Flux CRM

| Sursă | Ce conține |
|-------|------------|
| `crm_offers.response` | `status: accept`, `at`, `verifiedEmail` |
| `crm_offers.verification` | Timestamps OTP (similar lucrări) |
| `crm_activity_logs` | `OFFER_ACCEPTED` + eventual `STAGE_CHANGED` → `OFERTA_ACCEPTATA` |

---

## C. Checklist practic pentru un caz concret

```
□ 1. Găsește tichetul (număr raport / client / locație)
□ 2. Pagina tichetului → secțiunea Ofertă:
     - Răspuns ofertă (client): status, dată, email verificat
     - Istoric ofertare → Detalii pe versiunea acceptată
     - PDF ofertă (dacă există)
□ 3. Loguri → Email: filtrează type=OFFER + lucrareId
□ 4. Loguri → Acțiuni: filtrează categorie „Portal ofertă” + lucrareId
□ 5. Firestore (admin/dev): lucrari/{id}/offerAudit — timeline complet
□ 6. Extern: folder Sent pe server mail — emailul original + cod validare
□ 7. (Opțional) Email confirmare post-accept trimis automat clientului
```

---

## D. Limitări actuale

| Ce lipsește sau e incomplet | Impact |
|----------------------------|--------|
| Nu există buton „Export dosar dovada” | Trebuie adunat manual din mai multe locuri |
| `offerAudit` nu e expus în UI | Doar Firestore / loguri globale |
| Corpul emailului de ofertă nu e salvat în DB | Doar HTML trimis; recuperare din Sent IMAP |
| Email cod validare nu e în `emailEvents` | Doar în `offerAudit` + Sent IMAP |
| `offerSendCount` nu reflectă mereu trimiterile | Contorizare inconsistentă; folosește `lastOfferEmail.sentAt` |
| Fără IP / User-Agent / device fingerprint | Nu poți dovedi de pe ce dispozitiv a acceptat |
| CRM fără `offerAudit` dedicat | Audit mai slab decât la Lucrări |
| Fără semnătură digitală / PDF semnat la accept | Accept = acțiune electronică + OTP, nu semnătură olografă |

**Combinație puternică pentru dosar comercial/juridic:**

> email trimis (`lastOfferEmail` + `emailEvents`) + snapshot ofertă (`acceptedOfferSnapshot`) + accept cu timestamp + email verificat OTP + audit trail (`offerAudit`)

---

# Plan 2 — Ce putem construi pentru VIITOR

## Obiectiv

Un **„Dosar Ofertă”** pe tichet/oportunitate: timeline cronologic + export PDF/JSON cu tot ce e relevant pentru dispute.

---

## Faza 1 — Vizibilitate (estimare: 2–3 zile dev)

**Timeline Ofertă în UI** pe pagina tichetului (similar CRM timeline):

```
[12.06 14:32] Ofertă pregătită de Ion Popescu (v3, 12.450 lei)
[12.06 14:35] Email trimis → client@firma.ro (messageId: abc123)
[12.06 14:35] Link generat (expiră 12.07)
[15.06 09:12] Client deschise linkul
[15.06 09:13] Cod OTP trimis → client@firma.ro
[15.06 09:14] Cod verificat cu succes
[15.06 09:15] ✅ ACCEPT — client@firma.ro
[15.06 09:15] Snapshot acceptat salvat (v3)
[15.06 09:16] Email confirmare trimis
```

**Sursă:** agregare din `offerAudit` + `emailEvents` + câmpuri pe lucrare + loguri acțiuni.

**Buton „Export dosar”** → PDF/JSON cu:

- Date identificare (client, CUI, locație, nr. tichet)
- Oferta trimisă (linii, total, termeni, PDF)
- Dovada trimiterii (dată, destinatar, messageId)
- Dovada acceptării (dată/ora, email OTP, versiune)
- Timeline complet

---

## Faza 2 — Colectare date noi (estimare: ~1 săptămână dev)

La fiecare eveniment din fluxul ofertei, log **imutabil** în colecția `offerEvents`:

| Eveniment | Date noi de colectat |
|-----------|----------------------|
| `OFFER_PREPARED` | actor, versiune, hash snapshot |
| `OFFER_EMAIL_SENT` | to, cc, subject, **bodyHtml arhivat**, attachments[], messageId, actor |
| `OFFER_LINK_OPENED` | IP, User-Agent, referer, timestamp |
| `OFFER_CODE_REQUESTED` | email, IP, UA |
| `OFFER_CODE_SENT` | email, messageId (și în emailEvents) |
| `OFFER_CODE_VERIFIED` | email, IP, UA, durată de la trimitere cod |
| `OFFER_ACCEPTED` / `OFFER_REJECTED` | email, IP, UA, snapshot hash, motiv refuz |
| `OFFER_CONFIRMATION_SENT` | email confirmare post-răspuns |

**Reguli:**

- Append-only (fără ștergere/editare)
- Hash SHA-256 pe snapshot pentru integritate
- Paritate CRM ↔ Lucrări (același model)

---

## Faza 3 — Nivel „legal-ready” (estimare: 2–3 săptămâni)

| Feature | Beneficiu |
|---------|-----------|
| Arhivă email completă (HTML + PDF atașat în Storage) | Nu depinde de Sent IMAP |
| PDF „Proces verbal acceptare” generat automat | Document semnabil intern |
| Termeni acceptați afișați explicit înainte de confirm | „Am citit și accept condițiile” |
| Retenție configurabilă (ex. 5 ani) | Conformitate |
| Export semnat (hash + timestamp server) | Integritate dosar |
| Notificare internă la accept | Alert dispecer/comercial |

---

## Faza 4 — Unificare CRM + Lucrări

- Același component `OfferEvidenceTimeline` pe ambele entități
- Legătură `lucrareId ↔ opportunityId` unde există
- API: `GET /api/offers/{id}/evidence-pack` → JSON complet

---

## Prioritizare recomandată

| Prioritate | Ce | De ce |
|------------|-----|-------|
| 🔴 Acum | Checklist Plan 1 pe cazul concret | Rezolvă disputa curentă |
| 🟠 Săptămâna viitoare | Timeline UI + export JSON din date existente | Fără date noi, doar agregare |
| 🟡 Luna viitoare | `offerEvents` + arhivă email + IP/UA | Protecție pentru cazuri viitoare |
| 🟢 Later | PDF legal + termeni expliciți | Nivel avocat |

---

## Rezumat pentru comunicare cu clientul

**Pentru cazul actual**, pe fiecare tichet unde clientul a acceptat prin portal putem scoate:

1. **Oferta trimisă** — PDF, linii produse, total, dată trimitere, email destinatar (din tichet + loguri email)
2. **Acceptul** — dată și ora exactă, emailul cu care s-a verificat (cod OTP), versiunea acceptată (snapshot identic cu ce a primit)
3. **Timeline tehnic** — deschidere link, trimitere cod, verificare cod, confirmare accept (din audit Firestore + loguri)

**Ce nu avem acum:** export într-un singur click, IP/dispozitiv, corp email salvat în sistem (dar există în Sent pe server mail).

**Pe viitor** putem avea un timeline vizual + export PDF dosar complet, cu arhivă email și date tehnice suplimentare.

---

## Referințe tehnice (cod)

| Fișier / colecție | Rol |
|-------------------|-----|
| `lib/offer/evidence-types.ts` | Tipuri pack + timeline |
| `lib/offer/offer-events.server.ts` | Logger `offerEvents` |
| `lib/offer/evidence-aggregate.server.ts` | Agregare legacy + complete |
| `lib/offer/evidence-pdf.ts` | Export PDF dosar |
| `components/offer/offer-evidence-panel.tsx` | UI timeline + export |
| `app/api/lucrari/[id]/offer-evidence/route.ts` | API dosar tichet |
| `lib/offer/portal-audit.ts` | Scrie în `lucrari/{id}/offerAudit` și `logs` |
| `app/api/offer/respond/route.ts` | Procesează accept/refuz + salvează snapshot |
| `app/api/offer/send-code/route.ts` | Trimite cod OTP |
| `app/api/offer/verify-code/route.ts` | Validează cod + emite proof |
| `app/api/crm/offers/issue/route.ts` | Emite ofertă CRM |
| `app/api/crm/offers/respond/route.ts` | Accept/refuz CRM |
| `app/dashboard/lucrari/[id]/page.tsx` | UI istoric ofertare + dosar |
| `app/crm/opportunities/[id]/offers/page.tsx` | UI dosar CRM |
| Colecție Firestore `offerEvents` | Evenimente complete post-deploy |
