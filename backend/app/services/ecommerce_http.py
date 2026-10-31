"""Credential-safe HTTPS requests to public store hosts, with pinned DNS."""
import asyncio
import ipaddress
import socket
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlsplit, urlunsplit

import httpx


def normalize_store_url(value: str, shopify: bool = False) -> str:
    raw = value.strip()
    parsed = urlsplit(raw if '://' in raw else 'https://' + raw)
    host = (parsed.hostname or '').lower().rstrip('.')
    if parsed.scheme != 'https' or not host or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.port not in (None, 443):
        raise ValueError('Gebruik een openbare HTTPS-winkel-URL zonder inloggegevens of parameters.')
    try:
        ipaddress.ip_address(host)
    except ValueError:
        pass
    else:
        raise ValueError('Gebruik de domeinnaam van je winkel.')
    if shopify and (not host.endswith('.myshopify.com') or host.count('.') != 2 or parsed.path.strip('/')):
        raise ValueError('Gebruik je vaste winkelnaam.myshopify.com-adres.')
    if any(part in ('', '.', '..') for part in parsed.path.strip('/').split('/')) and parsed.path.strip('/'):
        raise ValueError('Ongeldig winkelpad.')
    return urlunsplit(('https', host, parsed.path.rstrip('/'), '', ''))


def cents(value) -> int:
    if value in (None, ''):
        return 0
    try:
        amount = Decimal(str(value))
        if not amount.is_finite():
            raise ValueError('Invalid monetary amount')
        return int((amount * 100).quantize(Decimal('1'), rounding=ROUND_HALF_UP))
    except (InvalidOperation, TypeError) as exc:
        raise ValueError('Invalid monetary amount') from exc


async def store_get(client, url, *, headers=None, auth=None, origin=None):
    """Pin public DNS addresses and never forward credentials across origins."""
    target = httpx.URL(url)
    if target.scheme != 'https' or target.port not in (None, 443) or target.userinfo:
        raise ValueError('Unsafe store URL')
    if origin and target.host != httpx.URL(origin).host:
        raise ValueError('Pagination changed the store host')
    addresses = await asyncio.get_running_loop().getaddrinfo(target.host, 443, type=socket.SOCK_STREAM)
    ips = [item[4][0] for item in addresses]
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError('Winkeladres verwijst niet naar een openbaar netwerk.')
    pinned = target.copy_with(host=ips[0])
    request_headers = dict(headers or {})
    request_headers['Host'] = target.host
    for attempt in range(3):
        response = await client.get(pinned, headers=request_headers, auth=auth,
                                    extensions={'sni_hostname': target.host}, follow_redirects=False)
        if response.status_code not in (429, 502, 503, 504) or attempt == 2:
            if 300 <= response.status_code < 400:
                raise ValueError('Gebruik de definitieve HTTPS-winkel-URL; omleidingen worden niet gevolgd.')
            return response
        try:
            delay = min(5, max(0, float(response.headers.get('Retry-After', 1))))
        except ValueError:
            delay = 1
        await asyncio.sleep(delay)
