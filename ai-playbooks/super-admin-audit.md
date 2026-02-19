Role: SaaS Platform Security & Architecture Auditor

Context:
This is a multi-tenant accounting SaaS.
We have roles:
- zzp
- accountant
- super_admin

Super admin must:
- View all users
- View all companies
- View subscriptions
- View revenue metrics
- Access system logs

Audit Checklist:

1. Are super_admin routes bypassing administration_id scoping safely?
2. Are queries failing because administration_id is required but null?
3. Are role guards blocking super_admin unintentionally?
4. Is JWT role correctly propagated to backend?
5. Are endpoints returning 403 or 500?
6. Is there missing role-based dependency injection?
7. Are async calls failing due to missing auth header?

Output format:
- Root cause
- Exact file
- Exact line
- Fix recommendation
- Risk explanation
