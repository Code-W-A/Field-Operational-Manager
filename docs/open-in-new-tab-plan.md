# Plan: Open in new tab (click scroll / click dreapta)

## Scop

Butonale / rândurile care **duc la o pagină** din FOM să se comporte ca link-uri normale:

- click stânga → același tab
- click pe scroll (mijloc) / „Open in new tab” → tab nou

**Nu** se aplică la butoane de acțiune (Salvează, Șterge, Start pontaj, Upload etc.) — alea nu au URL.

## Regulă de implementare

| Situație | Ce facem |
|----------|----------|
| Navigare UI (utilizatorul alege unde merge) | `<Button asChild><Link href="...">...</Link></Button>` sau `<Link href="...">` cu aceleași clase |
| Redirect după acțiune (login, salvare, delete) | **lăsăm** `router.push` — nu e „link” |
| Logout / guard auth / unsaved changes | **lăsăm** `router.push` |
| Rând de tabel clickabil | ideal: `getRowHref` + `<a>` pe rând / celulă; interim: auxclick (buton mijloc) → `window.open` |

Pattern preferat (păstrează UI):


<Button asChild variant="outline" size="sm">
  <Link href={`/dashboard/lucrari/${id}`}>Vezi</Link>
</Button>
```

Există deja `components/safe-link.tsx` (Link + guard navigare) — util unde e nevoie de confirmare unsaved changes.

---

## Ce NU intră în scope (pe etape)

- `app/login/page.tsx`, `protected-route`, `user-nav` logout
- `hooks/use-navigation-prompt.ts`, `use-unsaved-changes.ts`, `navigation-guard.tsx`
- Redirect după submit în formulare (ex. după edit lucrare → detalii)
- Dialoguri „welcome” care doar te trimit la listă după închidere

---

## Etape (ordinea = impact pentru Alin / ops)

Marchează `[x]` când e gata. Test pe fiecare etapă: click stânga + click scroll pe cel puțin 2–3 elemente.

### Etapa 0 — Convenție + helper (mic, o dată)

- [ ] Documentat patternul (acest fișier)
- [ ] Opțional: helper scurt `NavButton` / `navLinkClass` dacă se repetă mult `Button asChild` + `Link`
- [ ] Opțional: pe `DataTable` — prop `getRowHref?: (row) => string` pe lângă `onRowClick` (middle-click / open in new tab pe rând)

**Locații:** `components/ui/button.tsx` (deja are `asChild`), `components/data-table/data-table.tsx`, eventual componentă nouă mică.

---

### Etapa 1 — Lucrări (cel mai folosit)

**Prioritate maximă.** **Status: DONE (2026-08-04)** — doar navigare UI; design neschimbat (`Button asChild` + `Link` / middle-click pe rânduri).

| Locație | Ce convertim |
|---------|----------------|
| `app/dashboard/lucrari/page.tsx` | deschidere detaliu lucrare (tabel + carduri) |
| `components/data-table/data-table.tsx` | `getRowHref` → click scroll / Ctrl·Cmd+click |
| `app/dashboard/lucrari/[id]/page.tsx` | linkuri către tichet legat, reintervenții, revizie, istoric echipament |
| `components/add-lucrare-dialog.tsx` | „Deschide” pe conflict |
| `components/lucrare-form.tsx` | „Deschide tichet” |
| `components/lucrari-notifications-dialog.tsx` | card + „Vezi lucrarea” |
| `components/work-modifications-dialog.tsx` | „Vezi lucrarea” / „Vezi toate lucrările” |

- [x] Listă lucrări → detaliu
- [x] Detaliu lucrare → linkuri interne
- [x] Dialoguri / form care deschid altă lucrare

**Nu în etapa 1 (lăsat intenționat):** `router.push` după salvare/ștergere/arhivare/reintervenție; buton Raport (uneori descarcă PDF, nu navighează).

#### Cum verifici Etapa 1 (design + UX)

1. **Listă `/dashboard/lucrari` (tab Tabel)**  
   - click stânga pe un rând → același tab, același aspect  
   - click pe scroll pe rând → tab nou cu detaliul  
   - Ctrl/Cmd+click → tab nou  
   - click dreapta pe rând: *nu* apare „Open in new tab” (rândul nu e `<a>`; e limitare cunoscută)

2. **Listă carduri (mobil / tab Carduri)**  
   - același test: stânga / scroll / Ctrl·Cmd pe card

3. **Detaliu lucrare** — pe butoanele convertite, click dreapta **trebuie** să arate „Open in new tab”:  
   - Deschide (conflict echipament)  
   - Vizualizează lucrarea originală  
   - Vezi lucrarea inițială (deja era link)  
   - Vezi reintervenția  
   - buton mare Revizie pe echipament  
   - Deschide lucrarea în lucru  
   - Vezi istoric / icon History pe cod echipament  

4. **Dialog Adaugă / formular** — „Deschide” / „Deschide tichet” pe conflicte: scroll + Open in new tab

5. **Dialog notificări / modificări lucrări** — „Vezi lucrarea”: scroll + Open in new tab; aspect neschimbat

6. **Sanity design** — aceleași dimensiuni butoane (h-7, h-6, h-8 icon, full-width revizie), aceleași culori/borduri; nimic „link albastru subliniat”

7. **Nu s-a stricat** — Salvează / Șterge / Arhivează / Raport / Edit / Reintervenție tot cu click normal (fără tab nou forțat)

---

### Etapa 2 — Dashboard home + notificări vizuale

**Status: DONE (2026-08-04)**

| Locație | Ce convertim |
|---------|----------------|
| `app/dashboard/page.tsx` | bubble-uri → lucrare; „Deschide istoricul” |
| `components/work-bubble-status.tsx` / `work-bubble-assigned.tsx` | prop opțional `href` (Link, UI identic) |

- [x] Click pe item dashboard → lucrare / istoric (ca Link sau echivalent)

---

### Etapa 3 — Clienți + facturi + istoric

**Status: DONE (2026-08-04)**

| Locație | Ce convertim |
|---------|----------------|
| `app/dashboard/clienti/page.tsx` | listă → detaliu client (tabel + carduri + Vizualizează) |
| `app/dashboard/clienti/[id]/page.tsx` | ultimele tichete + „Vezi toate” |
| `app/dashboard/facturi/page.tsx` | buton Lucrare + rând |
| `app/dashboard/istoric-interventii/page.tsx` | rând / card → tichet |
| `app/dashboard/istoric-interventii/echipament/page.tsx` | Înapoi la lucrări |
| `components/equipment-history-check-dialog.tsx` | Deschide istoricul |

- [x] Clienți listă + detalii
- [x] Facturi
- [x] Istoric intervenții

---

### Etapa 4 — Contracte + arhivate + raport

**Status: DONE (2026-08-04)**

| Locație | Ce convertim |
|---------|----------------|
| `app/dashboard/contracte/page.tsx` | rând, Înapoi la contract, Vezi contract (calendar) |
| `app/dashboard/contracte/[id]/page.tsx` | Înapoi, calendar, edit, Vezi detalii client |
| `components/client-contracts-manager.tsx` | Creează Contract |
| `app/dashboard/arhivate/page.tsx` | Eye / Raport / rând / card |
| `app/dashboard/arhivate/[id]/page.tsx` | Înapoi (error), Descarcă/Accesează Raport |
| `app/raport/[id]/page.tsx` | Înapoi la lucrări (stare eroare) |

- [x] Contracte
- [x] Arhivate
- [x] Raport (butoane de navigare)

**Lăsat intenționat:** redirect după acces/denied, dezarhivare, submit raport.

---

### Etapa 5 — CRM

**Status: DONE (2026-08-04)**

| Locație | Ce convertim |
|---------|----------------|
| `app/crm/dashboard/page.tsx` | Vezi oportunitățile |
| `app/crm/opportunities/[id]/layout.tsx` | Deschide client, Vezi toate, oportunități conexe |

- [x] Linkuri CRM de navigare între pagini

**Lăsat intenționat:** redirect după create (`onCreated`), după ștergere, „Oportunitate nouă” (deschide dialog create).

---

### Etapa 6 — HR / salariați

**Status: DONE (2026-08-04)**

| Locație | Ce convertim |
|---------|----------------|
| `components/hr/employees-table.tsx` | Fișă + rând → salariat |
| `app/dashboard/resurse-umane/salariati/[id]/page.tsx` | Înapoi, Utilizatori, condică, rapoarte |
| `components/hr/employee-edit-dialog.tsx` | → departamente |

- [x] Tabel salariați + pagină detaliu

**Lăsat intenționat:** schimbare lună (`?month=`) pe aceeași pagină.

---

### Etapa 7 — Restul (low traffic)

**Status: DONE (2026-08-04)**

| Locație | Note |
|---------|------|
| `app/portal/[id]/page.tsx` | Înapoi la portal |
| `app/dashboard/admin/page.tsx` | Accesează (cu `href`; onClick rămâne pentru stub-uri) |
| `app/debug/page.tsx` | Dashboard / Utilizatori |
| `app/review/[id]/page.tsx` | Închide / Anulează |

- [x] Portal / admin / misc

---

## Test checklist (per etapă)

1. Click stânga pe element → același tab, URL corect
2. Click scroll (mijloc) → tab nou cu aceeași URL
3. Click dreapta → apare „Open in new tab” / „Deschide în filă nouă”
4. UI neschimbat (aceleași stiluri de buton/rând)
5. Nu se strică flow-uri cu unsaved changes (unde există guard)

---

## Răspuns scurt pentru client (când e cazul)

> Se face pe etape, pe zonele cele mai folosite (întâi Lucrări, apoi Clienți/Contracte etc.). Butoanele care deschid o pagină vor permite tab nou cu click pe scroll. Butoanele de Salvare/Ștergere rămân ca acum.

---

## Status

| Etapă | Status |
|-------|--------|
| 0 Convenție / DataTable | done (getRowHref) |
| 1 Lucrări | done |
| 2 Dashboard | done |
| 3 Clienți / facturi / istoric | done |
| 4 Contracte / arhivate / raport | done |
| 5 CRM | done |
| 6 HR | done |
| 7 Rest | done |

Ultima actualizare: 2026-08-04 (toate etapele 1–7 implementate)