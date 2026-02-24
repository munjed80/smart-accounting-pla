# Documenten Inbox v1 — Handmatige teststappen

## Overzicht

De Documenten-pagina is de centrale intake-inbox voor bonnen en facturen (ZZP). Hier kun je:
- Bestanden uploaden (PDF, JPG, PNG, HEIC)
- Documenten bekijken en categoriseren
- Een document omzetten naar een Uitgave ("Maak uitgave")
- Documenten markeren als verwerkt of verwijderen

---

## Backend endpoints

| Methode | URL | Beschrijving |
|---------|-----|-------------|
| POST | `/api/v1/zzp/documents/upload` | Upload één of meerdere bestanden (multipart, `files[]`) |
| GET | `/api/v1/zzp/documents` | Lijst van documenten (filter: `status`, `type`, `q`) |
| GET | `/api/v1/zzp/documents/{id}` | Detail van één document |
| PATCH | `/api/v1/zzp/documents/{id}` | Metagegevens/status aanpassen |
| POST | `/api/v1/zzp/documents/{id}/create-expense` | Document omzetten naar Uitgave |
| DELETE | `/api/v1/zzp/documents/{id}` | Document verwijderen |

---

## Handmatige teststappen

### 1. Upload één bon

1. Log in als ZZP-gebruiker.
2. Navigeer naar **Documenten** in de zijbalk.
3. Klik op **Upload bon/factuur**.
4. Selecteer een PDF of afbeeldingsbestand (max. 20 MB).
5. ✅ Verwacht: Het bestand verschijnt in de **Inbox**-tab met status **Nieuw** en type **Overig**.

### 2. Upload meerdere bestanden tegelijk

1. Klik op **Upload bon/factuur**.
2. Selecteer meerdere bestanden (Ctrl/Cmd + klik).
3. ✅ Verwacht: Alle bestanden verschijnen direct in de inbox; toast "N document(en) geüpload."

### 3. Document bekijken en type aanpassen

1. Klik op een document in de Inbox.
2. ✅ Verwacht: Detail-modal verschijnt met bestandsnaam, datum, status-badge en type-badge.
3. (Optioneel) Klik **Markeer als verwerkt** → document verplaatst naar **Verwerkt**-tab.

### 4. Maak uitgave van een document

1. Klik op een document in de Inbox.
2. Klik op **Maak uitgave** (oranje knop rechtsonder).
3. ✅ Verwacht: Modal "Maak uitgave" opent, vooringevuld met bekende gegevens (leverancier, bedrag, datum).
4. Vul eventuele ontbrekende velden in (leverancier is verplicht, bedrag > 0).
5. Klik **Uitgave opslaan**.
6. ✅ Verwacht: Toast "Uitgave opgeslagen en document gekoppeld."
7. Ga naar **Uitgaven** in de zijbalk.
8. ✅ Verwacht: De nieuwe uitgave is zichtbaar.
9. Terug naar **Documenten** → **Verwerkt**-tab.
10. ✅ Verwacht: Het document staat daar met status **Verwerkt**.

### 5. Document verwijderen

1. Klik op een document in de Inbox.
2. Klik op de rode **Verwijderen**-knop.
3. Bevestig in de dialoog.
4. ✅ Verwacht: Document verdwijnt; toast "Document verwijderd."

### 6. Zoeken op bestandsnaam

1. Typ in het zoekveld een deel van een bestandsnaam.
2. ✅ Verwacht: Alleen documenten met die tekst in de naam worden getoond in de actieve tab.

### 7. Lege staat

1. Als er geen documenten zijn, zie je:
   - In **Inbox**: "Nog geen documenten. Upload je eerste bon of factuur."
   - In **Verwerkt**: "Geen verwerkte documenten."

### 8. Foutafhandeling

1. Probeer een bestand te uploaden dat groter is dan het maximum.
2. ✅ Verwacht: Foutmelding "Bestand te groot." (geen "Offline/Network error").
3. Probeer een ongeldig bestandstype (bijv. `.txt`).
4. ✅ Verwacht: Foutmelding "Ongeldig bestandstype."

---

## Datamodel

### `zzp_documents`

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| `id` | UUID PK | Uniek identificatienummer |
| `administration_id` | UUID FK | Administratie (tenant scoping) |
| `user_id` | UUID FK nullable | Uploading user |
| `filename` | VARCHAR(500) | Originele bestandsnaam |
| `mime_type` | VARCHAR(100) | MIME-type (image/jpeg, application/pdf, etc.) |
| `storage_ref` | VARCHAR(1000) | Pad naar opgeslagen bestand |
| `doc_type` | ENUM | BON / FACTUUR / OVERIG |
| `status` | ENUM | NEW / REVIEW / PROCESSED / FAILED |
| `supplier` | VARCHAR(255) nullable | Leveranciersnaam |
| `amount_cents` | INTEGER nullable | Bedrag in centen |
| `vat_rate` | NUMERIC(5,2) nullable | BTW-percentage |
| `doc_date` | DATE nullable | Documentdatum |
| `created_at` | TIMESTAMPTZ | Aanmaakdatum |
| `updated_at` | TIMESTAMPTZ | Laatste wijziging |

### `zzp_expenses` (uitbreiding)

| Kolom | Type | Beschrijving |
|-------|------|-------------|
| `document_id` | UUID FK nullable | Koppeling naar bronbestand in `zzp_documents` |

---

## Beveiliging

- Alle queries zijn gescoopt op `administration_id` (ZZP, geen cross-tenant).
- Alleen ZZP-gebruikers hebben toegang (`require_zzp` dependency).
- Verwijderen en aanpassen zijn alleen mogelijk als de gebruiker lid is van dezelfde administratie.

---

## Migratie

Bestand: `backend/alembic/versions/047_add_zzp_documents.py`

- Maakt `zzp_documents`-tabel aan met enums `zzpdoctype` en `zzpdocstatus`.
- Voegt `document_id` (nullable, FK naar `zzp_documents`) toe aan `zzp_expenses`.

Uitvoeren:
```bash
cd backend
alembic upgrade head
```
