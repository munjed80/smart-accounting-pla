# Invoice editor and PDF rollout

Deploy frontend and backend together after revision `061_invoice_editor_integrity`.

## Preflight

Back up PostgreSQL and run this read-only query before deployment:

```sql
SELECT administration_id, invoice_number, COUNT(*)
FROM zzp_invoices
GROUP BY administration_id, invoice_number HAVING COUNT(*) > 1;
```

Revision 061 aborts before adding columns/indexes if duplicates exist. Review historical duplicates with the accountant before proceeding. Never automatically renumber issued invoices. The migration adds nullable delivery dates and creation retry keys, plus unique indexes for invoice numbers and retry keys per administration. It does not change existing monetary amounts or infer service dates.

## New behavior

- Invoice lines accept up to two quantity decimals. Net cents and VAT cents use decimal half-up rounding per line. The editor and backend use the same policy. Existing issued totals are preserved; explicitly editing a draft recalculates its lines.
- Creation retries with the same `Idempotency-Key` return the original invoice. Reusing that key for a different payload returns 409. No content-based automatic deduplication is performed.
- All invoice creators share the administration lock and number generator, including time invoicing and quote conversion. Quote conversion preserves agreed quote amounts.
- Explicit null clears due date, service date and notes. Omitted patch fields retain their values. Empty line replacements and a due date before issue date return 422.
- Draft edits and issuance refresh seller details. Issued snapshots are not changed during PDF reads. Old issued invoices with incomplete snapshots remain incomplete and require review against their originals; current company data is not silently inserted into history.
- Previewing an unsaved concept writes no invoice, reserves no number and posts no journal. The preview endpoint accepts the same validated amounts as creation.
- Preview, download, public sharing and email use the same renderer. WeasyPrint/Pango renders Unicode and long content; ReportLab is a Latin-text fallback. If Unicode rendering is unavailable, return an explicit error instead of dropping glyphs. Free text is escaped, and external resources are blocked. Existing remote logo URLs are not fetched by the renderer.
- Downloads use authenticated requests and validate the PDF before offering it to the browser. Login JWTs in query strings are rejected. Public invoice-specific share links remain available. Unicode filenames use RFC 5987 headers.
- The editor warns before discarding changes and offers a real PDF preview, service date, customer search and direct PDF download for saved invoices. Browser saving is user controlled; the message reports that the PDF is ready, not that a file was saved to disk.

## Acceptance checks

On staging with a test account, check desktop and iPhone Safari/PWA:

1. Create a €19.99 line at 21% VAT; preview and saved totals must both be €24.19. Check fractional quantities and mixed VAT rates.
2. Preview an unsaved concept, then leave and confirm that no invoice/number was created. Change a field and verify close/escape and browser refresh protections.
3. Create, edit, clear optional fields, save, follow a direct invoice URL and download. Simulate a request failure and retry the same creation action; only one invoice should exist.
4. Test Arabic customer/description text, multiline notes, long notes and multiple pages. Confirm concept/cancelled/paid labels and service dates. Check both file download and public sharing.
5. With a configured test email provider, send a draft and resend a paid invoice. Compare contents with authenticated and shared PDFs. If PDF generation or provider delivery fails, status must not be committed as sent.
6. Change a company profile and confirm that issuing a draft refreshes its snapshot while downloading an issued invoice does not change its historical details.

CI runs the migration against PostgreSQL, checks the duplicate preflight and exercises simultaneous first-counter creation. Local SQLite tests cannot prove PostgreSQL locking semantics. Automated component/PDF tests do not replace the signed-in browser checks above.
