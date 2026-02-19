# Super Admin handmatige checklist

1. Log in met een gebruiker met rol `super_admin`.
2. Open `/admin` (Users overview).
3. Controleer dat de gebruikerslijst laadt zonder foutmelding.
4. Open browser network tab en bevestig dat `GET /api/v1/admin/overview` en `GET /api/v1/admin/users` status `200` geven.
