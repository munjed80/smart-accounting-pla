# ZZP Verplichtingen — Implementatieplan

## UI/UX structuur

### Navigatie
Onder **ZZP → Verplichtingen**:
- Overzicht (`/zzp/verplichtingen/overzicht`)
- Lease & Leningen (`/zzp/verplichtingen/lease-leningen`)
- Abonnementen (`/zzp/verplichtingen/abonnementen`)

### 1) Overzicht vaste verplichtingen
- KPI-cards: maandlasten, aankomende 30 dagen, waarschuwingen.
- Filter op type (lease/loan/subscription).
- Grafiek met maandelijkse verplichtingen (top 6) als balkvisualisatie.
- Waarschuwingsbanner bij hoge aankomende betalingen.

### 2) Lease & Leningen
- CRUD tabel met type, maandbedrag, rente.
- Form velden: naam, hoofdsom, rente, start/einddatum, maandbetaling, type.
- Amortisatieschema per item via endpoint (`/amortization`).

### 3) Abonnementen & Recurring kosten
- CRUD invoer voor abonnementen.
- Velden: naam, frequentie, bedrag, startdatum, contractduur, btw.
- Suggesties o.b.v. bankfeed patroonherkenning (frequente debiteringen).

## Datamodel

### Nieuwe tabel `financial_commitments`
- `id` UUID PK
- `administration_id` FK
- `type` enum: lease/loan/subscription
- `name`
- `amount_cents`
- `monthly_payment_cents`
- `principal_amount_cents`
- `start_date`, `end_date`
- `interest_rate`
- `recurring_frequency`
- `contract_term_months`, `renewal_date`, `btw_rate`
- `created_at`, `updated_at`

## Backend routes
Basis: `/api/v1/zzp/commitments`
- `GET /` lijst
- `POST /` create
- `GET /{id}` detail
- `PATCH /{id}` update
- `DELETE /{id}` delete
- `GET /{id}/amortization` schema
- `GET /overview/summary` dashboard data
- `GET /subscriptions/suggestions` bankfeed-suggesties

### Request voorbeeld (POST)
```json
{
  "type": "loan",
  "name": "Lening bedrijfsauto",
  "amount_cents": 45000,
  "monthly_payment_cents": 45000,
  "principal_amount_cents": 500000,
  "interest_rate": 5.2,
  "start_date": "2026-01-01",
  "end_date": "2028-12-31"
}
```

### Response voorbeeld (GET detail)
```json
{
  "id": "uuid",
  "administration_id": "uuid",
  "type": "loan",
  "name": "Lening bedrijfsauto",
  "amount_cents": 45000,
  "monthly_payment_cents": 45000,
  "principal_amount_cents": 500000,
  "interest_rate": 5.2,
  "start_date": "2026-01-01",
  "end_date": "2028-12-31"
}
```

## Validaties en UX guidance
- Bedragen ≥ 0.
- Einddatum mag niet vóór startdatum.
- Lease/loning vereist hoofdsom.
- Abonnement vereist frequentie.
- Frontend toont waarschuwing bij aankomende grote betalingen.

## Integratietests
- `backend/tests/test_zzp_commitments.py`
  - CRUD flow
  - amortization endpoint
  - overview endpoint
  - subscription suggestions endpoint
- `src/test/routing.test.ts`
  - nieuwe ZZP verplichtingen routes
