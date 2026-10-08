# Revizii și raport contra cost — remediere locală

Data: 08.10.2026. Domeniu: Next.js și backendul comun web–mobile. Fără modificări Expo, migrare de date sau publicare.

## Revizii

- Formularul și API-ul folosesc `checklistFromSettings`, cu un snapshot complet al setărilor. Punctele directe ale unei categorii au prioritate față de subcategorii, conform formularului existent.
- Secțiunile istorice ne-goale rămân autoritatea. Secțiunile absente sau goale folosesc șablonul echipamentului și fallbackul tichetului; identificatorii sunt normalizați.
- Copiii configurați pot forma checklistul chiar dacă documentul rădăcină lipsește. Un șablon fără puncte nu autorizează o structură arbitrară trimisă de client.
- Actualizarea checklistului sau eroarea API păstrează datele introduse. Interfața cere explicit reîncărcarea dacă structura nu mai corespunde.
- Cererile duplicate de verificare QR și salvare sunt blocate în formular.

## Intervenție contra cost

- Tehnicianul atribuit poate completa constatarea și descrierea intervenției în raport, după verificarea QR și înainte de blocare.
- „Salvează intervenția” folosește `intervention.save` și păstrează raportul editabil, fără a porni generarea PDF.
- `report.finalize` și `report.later` includ textul curent, fără salvare intermediară obligatorie. Ambele câmpuri sunt obligatorii la finalizare, inclusiv în API.
- Documentele emise rămân pentru consultare; contractul și endpointurile existente sunt păstrate.

## Verificare

- 13 teste unitare: generator, structură mixtă, rădăcină absentă, șablon indisponibil, normalizare și validări.
- 49 teste în emulatoare: serviciul comun web–mobile, fișe goale și istorice, validări/permisiuni, raport contra cost și 25 teste de instalare.
- Browser real, date fictive și email dezactivat: QR virtual, bifare, fotografie, eroare și reîncercare, reîncărcare, ciornă, schimbare de checklist, raport contra cost cu salvare/finalizare/semnare ulterioară. Formular verificat și la lățime de telefon.
- PDF-ul final generat local conține constatarea și lucrările introduse în formular.
- `npm run build` trece. Configurația existentă exclude verificarea TypeScript/lint din build; verificarea TypeScript separată raportează erori existente în proiect, inclusiv în codul vechi al paginii raportului. Generatorul, serviciul, formularul de revizie și testele modificate nu au erori raportate.

Camera fizică și comportamentul din producție nu sunt confirmate prin aceste teste locale. Remedierea devine disponibilă clienților numai după publicare.
