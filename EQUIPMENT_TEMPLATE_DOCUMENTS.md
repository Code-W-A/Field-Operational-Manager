# Configurare Documente Template pentru Echipamente

## Descriere
Sistemul permite acum selectarea de documente template din Setări în loc să fie necesar să uploadezi mereu același fișier PDF. Documentele template sunt stocate într-o locație centralizată (ex: Firebase Storage sau URL public) și pot fi atașate rapid la echipamente.

## Configurare în Setări (Variables)

### Pasul 1: Creează categoria părinte și leagă de dialog
1. Mergi la **Dashboard → Setări → Variables**
2. Creează o nouă variabilă de tip **folder** cu numele: `equipment`
3. Sub `equipment`, creează două subfolder-uri:
   - `documentTypes` (pentru tipurile de documente)
   - `templateDocuments` (pentru documentele template)

### Pasul 2: Leagă folder-ele de dialog
Vei lega folder-ele de 3 locuri diferite în aplicație:

1. **Pentru tipurile de documente:**
   - Click dreapta pe folder-ul `documentTypes` → **Leagă de dialog**
   - Selectează: **Formular Echipament → Tipuri documente**
   - Salvează

2. **Pentru documentele template:**
   - Click dreapta pe `templateDocuments` → **Leagă de dialog**
   - Selectează: **Formular Echipament → Documente template**
   - Salvează

3. **Pentru secțiunea de documente (opțional dar recomandat):**
   - Click dreapta pe `templateDocuments` → **Leagă de dialog**
   - Selectează și: **Dialog Echipament → Secțiune Documente**
   - Salvează
   - Acest lucru va face documentele disponibile direct în dialogul de echipament

### Pasul 3: Adaugă tipuri de documente
Sub `equipment/documentTypes`, adaugă variabile pentru fiecare tip de document:
- Manual
- Certificat
- Fișă Tehnică
- Instrucțiuni
- (etc.)

### Pasul 4: Adaugă documente template
Pentru fiecare document template pe care vrei să-l ai disponibil, creează o nouă variabilă sub `equipment.templateDocuments` cu următoarele câmpuri:

**Câmpuri obligatorii:**
- `name`: Numele documentului (ex: "Manual Utilizare UPS", "Certificat Conformitate")
- `url`: URL-ul complet către fișierul PDF (ex: "https://firebasestorage.googleapis.com/...")

**Câmpuri opționale:**
- `documentType`: Tipul documentului (va apărea în listă, ex: "Manual", "Certificat", "Fișă Tehnică")

### Exemplu de structură în Setări:

```
📁 equipment (folder)
  ├─ 📁 documentTypes (folder) ← Legat la "Formular Echipament → Tipuri documente"
  │    ├─ 📄 Manual
  │    ├─ 📄 Certificat
  │    ├─ 📄 Fișă Tehnică
  │    └─ 📄 Instrucțiuni
  │
  └─ 📁 templateDocuments (folder) ← Legat la "Formular Echipament → Documente template"
       ├─ 📄 Manual_UPS_Standard
       │    name: "Manual Utilizare UPS"
       │    url: "https://firebasestorage.googleapis.com/v0/b/project.appspot.com/o/documents%2Fmanual-ups.pdf?alt=media&token=..."
       │    documentType: "Manual"
       │
       ├─ 📄 Certificat_Conformitate_CE
       │    name: "Certificat Conformitate CE"
       │    url: "https://storage.example.com/docs/certificat-ce.pdf"
       │    documentType: "Certificat"
       │
       └─ 📄 Fisa_Tehnica_Generator
            name: "Fișă Tehnică Generator"
            url: "https://cdn.example.com/specs/generator.pdf"
            documentType: "Fișă Tehnică"
```

**IMPORTANT:** După ce creezi folder-ele și variabilele, nu uita să legi folder-ele de dialog folosind butonul "Leagă de dialog" (click dreapta pe folder).

## Utilizare în Dialog de Echipament

### Când adaugi/editezi un echipament:

1. **Buton „Adaugă documentație” (dialog cu icon-uri) – Recomandat**
   - În secțiunea **Documentație (PDF) – vizibil tehnicienilor** apasă pe butonul **Adaugă documentație**
   - Se deschide un dialog nou cu două coloane:
     - Stânga: categoriile (părinții legați la `equipment.documentation.section`)
     - Dreapta: documentele (copiii cu `documentUrl`) afișate ca icon-uri
   - Poți selecta **mai multe documente** prin click pe icon-uri
   - Apasă **Adaugă documente** pentru a le atașa echipamentului

2. **Dropdown „Selectați un document template” (adăugare rapidă)**
   - Alege un singur document din dropdown
   - Click pe butonul **Adaugă**
   - Documentul este adăugat imediat în lista de documentație

## Beneficii

✅ **Eficiență**: Nu mai uploadezi același PDF de 100 de ori  
✅ **Consistență**: Toate echipamentele au aceeași versiune a documentului  
✅ **Actualizare centralizată**: Schimbi URL-ul în Setări și toate echipamentele vor folosi versiunea nouă  
✅ **Organizare**: Documente template organizate într-o singură locație  
✅ **Flexibilitate**: Poți combina template-uri cu upload-uri custom  

## Note Tehnice

- Documentele template sunt stocate doar ca referințe (URL-uri), nu ca fișiere duplicate
- Când selectezi un template, se creează o copie a metadatelor în echipament
- Dacă ștergi documentul template din Setări, echipamentele existente vor păstra referința (URL-ul)
- URL-urile pot fi din Firebase Storage, AWS S3, Google Drive (public), sau orice alt serviciu de hosting

## Întrebări Frecvente

**Q: Cum obțin URL-ul unui PDF din Firebase Storage?**  
A: 
1. Încarcă fișierul în Firebase Storage (Console → Storage)
2. Click dreapta pe fișier → "Get download URL"
3. Copiază URL-ul complet cu token

**Q: Pot folosi Google Drive?**  
A: Da, dar trebuie să faci fișierul public și să folosești link-ul direct de download.

**Q: Ce se întâmplă dacă șterg un template folosit deja?**  
A: Echipamentele care deja au documentul atașat îl vor păstra (URL-ul rămâne valid). Doar nu va mai apărea în lista de template-uri pentru echipamente noi.

**Q: Pot avea atât template-uri cât și upload-uri pe același echipament?**  
A: Da, absolut! Poți combina ambele metode pentru același echipament.

## Suport

Pentru probleme sau întrebări, contactează echipa de dezvoltare.

