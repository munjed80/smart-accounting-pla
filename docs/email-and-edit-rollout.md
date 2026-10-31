# Dutch email and edit persistence rollout

## Scope

Authentication responses, toast messages, verification failures, verification/welcome
email, password resets, invoice emails and reminder layout use Dutch and ZZPers Hub
branding. Reminders retain the text entered by the accountant. HTML and plain text
are both supplied; dynamic HTML content is escaped. Provider acceptance requires a
message ID. Scheduled email reminders are no longer marked sent without a send call.
The scheduler still needs to be invoked by the deployment's periodic task runner.

Customer forms explain validation errors rather than disabling Save silently.
Unchanged legacy identifiers do not prevent unrelated edits. Clearing optional fields
sends explicit nulls for customers, expenses, quotes and time entries. Quote updates
now distinguish omitted fields from explicit nulls. Profile strings are trimmed.
Invoice draft editing already has regression coverage, including field clearing,
retry and protected invoice states. Existing restrictions on posted/invoiced records
and closed accounting periods are preserved.

Email notification preferences were only local state with a simulated success toast.
They are now visibly unavailable; no backend notification scheduling is implied.
Push settings and business-profile/password updates remain separate working controls.

## Deployment verification

Deploy both backend and frontend from this change and rebuild both images. Existing
emails in the recipient's mailbox will not change. A newly requested verification
email should have the subject `Bevestig je e-mailadres - ZZPers Hub`.
No database migration is required.

On a test account, edit and reopen a customer, draft invoice, business profile,
expense, quote and unbilled time entry. Clear optional fields, save, reload the page
and confirm they remain empty. Check that failed saves retain entered values.

## Inbox placement

This repository cannot establish the current GoDaddy/Resend configuration or inspect
an actual received message. Code and formatting cannot guarantee inbox placement.

1. Verify the sending domain in Resend. Copy the exact SPF and DKIM records from
   that domain's dashboard; do not replace unrelated DNS or mailbox MX records.
2. Verify DMARC for the sending domain. Keep existing valid records and avoid
   duplicate SPF/DMARC records at the same hostname.
3. Confirm FRONTEND_URL uses the live HTTPS site and the sending and link domains
   share the expected identity. Review RESEND_FROM_EMAIL, INVOICE_FROM_EMAIL,
   SUPPORT_EMAIL and the invoice Reply-To setting without exposing API keys.
4. Inspect a newly received message's Authentication-Results for SPF, DKIM and DMARC
   outcomes, then inspect Resend Deliverability Insights and the delivery event.
5. Review click/open tracking for authentication email and disable it for the
   authentication sending domain where appropriate. A delivered event means the
   receiving server accepted the message, not that it placed it in the inbox.

Reference: https://resend.com/guides/email/deliverability/why-emails-go-to-spam

## Local validation (2026-10-31)

- Production build, TypeScript and ESLint: passed.
- Vitest: 151 tests passed across 32 files.
- Playwright: 54 desktop/mobile Chromium checks passed.
- Backend suite: 1,081 passed, 12 skipped, 23 failed initially because the host's
  ALL_PROXY used a socks5h scheme unsupported by the installed httpx version.
  All three affected Mollie test files were rerun with only ALL_PROXY/all_proxy
  removed for the test process: all 28 tests passed, including all 23 failures.
  Across those runs, 1,104 backend tests passed. The 12 skipped tests require
  the PostgreSQL migration-test environment; they were not validated locally.
- No live customer emails were sent and no production DNS settings were changed.
