"""Edits must survive a fresh API read, including explicit field clearing."""
import pytest


@pytest.mark.asyncio
async def test_customer_edit_and_clear_survive_reload(async_client, auth_headers, test_customer):
    path = f'/api/v1/zzp/customers/{test_customer.id}'
    result = await async_client.put(path, headers=auth_headers, json={
        'name': 'Updated customer', 'phone': '0612345678', 'notes': 'Keep this',
        'btw_number': 'BE0123456789', 'status': 'inactive',
    })
    assert result.status_code == 200, result.text
    result = await async_client.put(path, headers=auth_headers, json={'phone': None})
    assert result.status_code == 200, result.text
    saved = (await async_client.get(path, headers=auth_headers)).json()
    assert saved['name'] == 'Updated customer'
    assert saved['phone'] is None
    assert saved['notes'] == 'Keep this'
    assert saved['btw_number'] == 'BE0123456789'
    assert saved['status'] == 'inactive'


@pytest.mark.asyncio
async def test_business_profile_edit_survives_reload(async_client, auth_headers):
    path = '/api/v1/zzp/profile'
    first = await async_client.put(path, headers=auth_headers, json={
        'company_name': 'Original', 'phone': '0612345678', 'website': 'https://example.com',
    })
    assert first.status_code == 200, first.text
    result = await async_client.put(path, headers=auth_headers, json={
        'company_name': 'Updated company', 'phone': '', 'website': '',
    })
    assert result.status_code == 200, result.text
    saved = (await async_client.get(path, headers=auth_headers)).json()
    assert saved['company_name'] == 'Updated company'
    assert not saved['phone'] and not saved['website']


@pytest.mark.asyncio
async def test_quote_clear_and_omitted_fields_survive_reload(async_client, auth_headers, test_customer):
    created = await async_client.post('/api/v1/zzp/quotes', headers=auth_headers, json={
        'customer_id': str(test_customer.id), 'issue_date': '2026-10-01',
        'valid_until': '2026-10-31', 'title': 'Original', 'notes': 'Note', 'terms': 'Terms',
        'lines': [{'description': 'Work', 'quantity': 1, 'unit_price_cents': 10000, 'vat_rate': 21}],
    })
    assert created.status_code == 201, created.text
    path = '/api/v1/zzp/quotes/' + created.json()['id']
    edited = await async_client.put(path, headers=auth_headers, json={'title': 'Updated'})
    assert edited.status_code == 200, edited.text
    assert edited.json()['notes'] == 'Note'
    assert edited.json()['valid_until'] == '2026-10-31'
    cleared = await async_client.put(path, headers=auth_headers, json={
        'valid_until': None, 'notes': None, 'terms': None,
    })
    assert cleared.status_code == 200, cleared.text
    saved = (await async_client.get(path, headers=auth_headers)).json()
    assert saved['title'] == 'Updated'
    assert all(saved[field] is None for field in ('valid_until', 'notes', 'terms'))
    assert saved['total_cents'] == 12100


@pytest.mark.asyncio
async def test_expense_clear_survives_reload(async_client, auth_headers):
    created = await async_client.post('/api/v1/zzp/expenses', headers=auth_headers, json={
        'vendor': 'Vendor', 'description': 'Original', 'notes': 'Original note',
        'expense_date': '2026-10-01', 'amount_cents': 12100, 'vat_rate': 21, 'category': 'algemeen',
    })
    assert created.status_code == 201, created.text
    path = '/api/v1/zzp/expenses/' + created.json()['id']
    edited = await async_client.put(path, headers=auth_headers, json={
        'vendor': 'Updated vendor', 'description': None, 'notes': None,
    })
    assert edited.status_code == 200, edited.text
    saved = (await async_client.get(path, headers=auth_headers)).json()
    assert saved['vendor'] == 'Updated vendor'
    assert saved['description'] is None and saved['notes'] is None


@pytest.mark.asyncio
async def test_time_entry_clear_survives_reload(async_client, auth_headers, test_customer):
    created = await async_client.post('/api/v1/zzp/time-entries', headers=auth_headers, json={
        'entry_date': '2026-10-01', 'hours': 2, 'description': 'Work', 'billable': True,
        'customer_id': str(test_customer.id), 'project_name': 'Project', 'hourly_rate': 75,
    })
    assert created.status_code == 201, created.text
    entry_id = created.json()['id']
    edited = await async_client.patch('/api/v1/zzp/time-entries/' + entry_id, headers=auth_headers, json={
        'description': 'Updated work', 'customer_id': None, 'project_name': None, 'hourly_rate': None,
    })
    assert edited.status_code == 200, edited.text
    entries = await async_client.get('/api/v1/zzp/time-entries/open', headers=auth_headers)
    assert entries.status_code == 200, entries.text
    saved = next(entry for entry in entries.json() if entry['id'] == entry_id)
    assert saved['description'] == 'Updated work'
    assert all(saved[field] is None for field in ('customer_id', 'project_name', 'hourly_rate', 'hourly_rate_cents'))
