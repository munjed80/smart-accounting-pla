# Accountant Portal Testing Guide

Dit document beschrijft hoe je de accountantsportal kunt testen, inclusief het aanmaken van testgebruikers en het doorlopen van de volledige flow.

## Inhoudsopgave

1. [Test Accounts Aanmaken](#1-test-accounts-aanmaken)
2. [ZZP Klant Onboarding](#2-zzp-klant-onboarding)
3. [Accountant Toewijzen](#3-accountant-toewijzen)
4. [Klant Selecteren en Dossier Openen](#4-klant-selecteren-en-dossier-openen)
5. [Verwachte API Calls](#5-verwachte-api-calls)
6. [Veelvoorkomende Problemen](#6-veelvoorkomende-problemen)
7. [Omgevingsvariabelen](#7-omgevingsvariabelen)

---

## 1. Test Accounts Aanmaken

### ZZP Gebruiker Registreren (via UI)

1. Ga naar de login pagina
2. Klik op "Registreren" 
3. Vul in:
   - E-mail: `zzp-test@example.com`
   - Wachtwoord: `TestWachtwoord123!`
   - Naam: `Test ZZP Klant`
   - Rol: `zzp`
4. Verificeer e-mail (of sla over in ontwikkelmodus)

### Accountant Registreren (via UI)

1. Ga naar de login pagina
2. Klik op "Registreren"
3. Vul in:
   - E-mail: `accountant@example.com`
   - Wachtwoord: `TestWachtwoord123!`
   - Naam: `Test Boekhouder`
   - Rol: `accountant`
4. Verificeer e-mail

### Via SQL (voor snelle tests)

```sql
-- Maak ZZP gebruiker (wachtwoord: TestWachtwoord123!)
INSERT INTO users (id, email, hashed_password, full_name, role, is_active, is_email_verified)
VALUES (
  gen_random_uuid(),
  'zzp-test@example.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4lNg5YU5HrVhK9Oy',
  'Test ZZP Klant',
  'zzp',
  true,
  true
);

-- Maak accountant gebruiker
INSERT INTO users (id, email, hashed_password, full_name, role, is_active, is_email_verified)
VALUES (
  gen_random_uuid(),
  'accountant@example.com',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4lNg5YU5HrVhK9Oy',
  'Test Boekhouder',
  'accountant',
  true,
  true
);
```

---

## 2. ZZP Klant Onboarding

Na inloggen als ZZP gebruiker:

1. App detecteert geen administratie → redirect naar `/onboarding`
2. Vul bedrijfsgegevens in:
   - Bedrijfsnaam
   - KVK-nummer (optioneel)
   - BTW-nummer (optioneel)
3. Administratie wordt aangemaakt
4. Gebruiker wordt doorgestuurd naar dashboard

### Controleren via API

```bash
# Login als ZZP
curl -X POST "http://localhost:8000/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=zzp-test@example.com&password=TestWachtwoord123!"

# Bekijk administraties
curl "http://localhost:8000/api/v1/administrations" \
  -H "Authorization: Bearer <token>"
```

---

## 3. Accountant Toewijzen

### Optie A: Via Onboarding Flow (Aanbevolen)

1. Log in als accountant
2. App detecteert geen toegewezen klanten → redirect naar `/accountant/onboarding`
3. Voer het e-mailadres van de ZZP klant in
4. Klik "Koppelen"
5. Klant verschijnt in de lijst

### Optie B: Via API

```bash
# Login als accountant
curl -X POST "http://localhost:8000/api/v1/auth/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=accountant@example.com&password=TestWachtwoord123!"

# Wijs klant toe via e-mail
curl -X POST "http://localhost:8000/api/v1/accountant/assignments/by-email" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"client_email": "zzp-test@example.com"}'
```

### Optie C: Via SQL (Admin)

```sql
-- Zoek de IDs
SELECT id, email FROM users WHERE role = 'accountant';
SELECT id, name FROM administrations;

-- Maak toewijzing
INSERT INTO accountant_client_assignments (id, accountant_id, administration_id, is_primary, assigned_by_id, assigned_at)
VALUES (
  gen_random_uuid(),
  '<accountant_user_id>',
  '<administration_id>',
  true,
  '<accountant_user_id>',
  NOW()
);
```

---

## 4. Klant Selecteren en Dossier Openen

### Via UI

1. Log in als accountant
2. Ga naar `/accountant/clients`
3. Klik op een klant om deze te selecteren
4. Of klik "Open dossier" om direct naar de issues te gaan
5. Navigeer via tabs:
   - **Issues**: Openstaande validatieproblemen
   - **Periodes**: Periodebeheer (review/finalize/lock)
   - **Beslissingen**: Beslissingsgeschiedenis

### Directe URL

```
/accountant/clients/{administration_id}/issues
/accountant/clients/{administration_id}/periods
/accountant/clients/{administration_id}/decisions
```

---

## 5. Verwachte API Calls

### Dashboard Summary (Accountant Home)

```
GET /api/v1/accountant/dashboard/summary
GET /api/v1/accountant/dashboard/clients
```

### Klantenoverzicht

```
GET /api/v1/accountant/clients
GET /api/v1/accountant/assignments
```

### Klanttoewijzing

```
POST /api/v1/accountant/assignments/by-email
  Body: {"client_email": "klant@email.nl"}

DELETE /api/v1/accountant/assignments/{assignment_id}
```

### Klantdossier

```
GET /api/v1/accountant/clients/{client_id}/overview
GET /api/v1/accountant/clients/{client_id}/issues
POST /api/v1/accountant/clients/{client_id}/journal/recalculate
```

### Issues & Suggesties

```
GET /api/v1/accountant/issues/{issue_id}/suggestions
POST /api/v1/accountant/issues/{issue_id}/decide
POST /api/v1/accountant/decisions/{decision_id}/execute
```

### Periodes

```
GET /api/v1/accountant/clients/{client_id}/periods
GET /api/v1/accountant/clients/{client_id}/periods/{period_id}
POST /api/v1/accountant/clients/{client_id}/periods/{period_id}/review
POST /api/v1/accountant/clients/{client_id}/periods/{period_id}/finalize
POST /api/v1/accountant/clients/{client_id}/periods/{period_id}/lock
GET /api/v1/accountant/clients/{client_id}/periods/{period_id}/snapshot
GET /api/v1/accountant/clients/{client_id}/periods/{period_id}/audit-logs
```

### Bulk Operaties

```
POST /api/v1/accountant/bulk/recalculate
POST /api/v1/accountant/bulk/ack-yellow
POST /api/v1/accountant/bulk/generate-vat-draft
POST /api/v1/accountant/bulk/send-reminders
```

---

## 6. Veelvoorkomende Problemen

### "Network Error" of CORS-fout

**Oorzaak**: Backend is niet bereikbaar of CORS is niet geconfigureerd.

**Oplossing**:
1. Controleer of backend draait op de juiste poort
2. Controleer `CORS_ORIGINS` in backend config
3. Zorg dat `VITE_API_URL` correct is ingesteld

```bash
# Voorbeeld
export CORS_ORIGINS="http://localhost:5173,https://app.zzpershub.nl"
export VITE_API_URL="http://localhost:8000"
```

### 403 NOT_ASSIGNED

**Oorzaak**: Accountant probeert klantdata te bekijken zonder toewijzing.

**Oplossing**:
1. Controleer of accountant is toegewezen aan de klant
2. Ga naar `/accountant/onboarding` om klant te koppelen
3. Of voeg via SQL/API een toewijzing toe

### 403 FORBIDDEN_ROLE

**Oorzaak**: Gebruiker probeert endpoint te bereiken voor andere rol.

**Oplossing**:
1. ZZP endpoints zijn alleen voor `role=zzp`
2. Accountant endpoints zijn voor `role=accountant` of `role=admin`
3. Admin endpoints zijn alleen voor `role=admin` + whitelisting

### Lege Klantenlijst

**Oorzaak**: Geen klanten toegewezen aan deze accountant.

**Oplossing**:
1. Redirect naar `/accountant/onboarding` om eerste klant te koppelen
2. Voer e-mailadres van ZZP klant in

### "Selected client not found"

**Oorzaak**: `localStorage.selectedClientId` bevat een oud/ongeldig ID.

**Oplossing**:
```javascript
// In browser console
localStorage.removeItem('selectedClientId');
localStorage.removeItem('selectedClientName');
```

---

## 7. Omgevingsvariabelen

### Frontend (Vite)

| Variable | Beschrijving | Voorbeeld |
|----------|-------------|-----------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8000` of `https://api.zzpershub.nl` |

### Backend (FastAPI)

| Variable | Beschrijving | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connectie | `postgresql+asyncpg://...` |
| `SECRET_KEY` | JWT signing key | (geen default, verplicht) |
| `CORS_ORIGINS` | Toegestane origins | `*` (dev) |
| `ADMIN_WHITELIST` | Admin e-mails | (leeg) |
| `REDIS_URL` | Redis voor caching (optioneel) | (niet ingesteld) |

---

## Testen op Coolify

### Checklist voor Deployment

1. **Environment Variables**
   - [ ] `DATABASE_URL` ingesteld
   - [ ] `SECRET_KEY` gegenereerd en veilig opgeslagen
   - [ ] `CORS_ORIGINS` bevat de frontend URL
   - [ ] `VITE_API_URL` wijst naar de backend URL

2. **Database**
   - [ ] PostgreSQL service draait
   - [ ] Migraties zijn uitgevoerd (`alembic upgrade head`)
   - [ ] Seed data is geladen (optioneel)

3. **Netwerk**
   - [ ] Backend is bereikbaar op de ingestelde poort
   - [ ] Frontend kan verbinden met backend
   - [ ] SSL certificaten zijn geldig

4. **Testen**
   - [ ] ZZP kan registreren en onboarden
   - [ ] Accountant kan registreren
   - [ ] Accountant kan klant koppelen via e-mail
   - [ ] Accountant kan dossier openen
   - [ ] Issues laden correct
   - [ ] Periodes laden correct

### Troubleshooting Commands

```bash
# Check container logs
docker logs <container_id>

# Test backend health
curl https://api.zzpershub.nl/health

# Check database connection
docker exec -it <backend_container> python -c "from app.core.database import engine; print('OK')"
```

---

## Contact

Bij problemen, neem contact op met het ontwikkelteam of maak een issue aan in de repository.
