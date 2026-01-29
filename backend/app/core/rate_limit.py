"""
Rate limiting for authentication endpoints.

Features:
- In-memory rate limiting (suitable for single-instance deployments)
- Per-IP rate limiting
- Configurable limits per endpoint
- TODO: Replace with Redis-based rate limiting for multi-instance deployments
"""
import time
import logging
from collections import defaultdict
from typing import Dict, Tuple
from functools import wraps

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


# TODO: Replace with Redis-based rate limiting for multi-instance deployments
# For production with multiple instances, use Redis to share rate limit state
class InMemoryRateLimiter:
    """
    Simple in-memory rate limiter using sliding window algorithm.
    
    Note: This only works correctly for single-instance deployments.
    For multi-instance deployments, replace with Redis-based implementation.
    """
    
    def __init__(self):
        # Structure: {endpoint: {ip: [(timestamp, count)]}}
        self._windows: Dict[str, Dict[str, list]] = defaultdict(lambda: defaultdict(list))
        self._cleanup_interval = 60  # seconds
        self._last_cleanup = time.time()
    
    def _cleanup_old_entries(self, window_seconds: int):
        """Remove entries older than the window."""
        current_time = time.time()
        
        # Only run cleanup periodically
        if current_time - self._last_cleanup < self._cleanup_interval:
            return
        
        self._last_cleanup = current_time
        cutoff = current_time - window_seconds
        
        for endpoint in list(self._windows.keys()):
            for ip in list(self._windows[endpoint].keys()):
                self._windows[endpoint][ip] = [
                    (ts, count) for ts, count in self._windows[endpoint][ip]
                    if ts > cutoff
                ]
                if not self._windows[endpoint][ip]:
                    del self._windows[endpoint][ip]
            if not self._windows[endpoint]:
                del self._windows[endpoint]
    
    def is_rate_limited(
        self,
        endpoint: str,
        ip: str,
        max_requests: int,
        window_seconds: int = 60,
    ) -> Tuple[bool, int]:
        """
        Check if request should be rate limited.
        
        Args:
            endpoint: Endpoint identifier
            ip: Client IP address
            max_requests: Maximum requests allowed in window
            window_seconds: Time window in seconds
            
        Returns:
            Tuple of (is_limited, requests_remaining)
        """
        self._cleanup_old_entries(window_seconds)
        
        current_time = time.time()
        cutoff = current_time - window_seconds
        
        # Get recent requests
        requests = self._windows[endpoint][ip]
        recent_requests = [(ts, count) for ts, count in requests if ts > cutoff]
        
        # Count total requests in window
        total_requests = sum(count for _, count in recent_requests)
        
        if total_requests >= max_requests:
            logger.warning(
                f"Rate limit exceeded for {endpoint}",
                extra={
                    "event": "rate_limit_exceeded",
                    "endpoint": endpoint,
                    "ip": ip,
                    "total_requests": total_requests,
                    "max_requests": max_requests,
                }
            )
            return True, 0
        
        # Record this request
        recent_requests.append((current_time, 1))
        self._windows[endpoint][ip] = recent_requests
        
        remaining = max_requests - total_requests - 1
        return False, remaining


# Global rate limiter instance
rate_limiter = InMemoryRateLimiter()


# Rate limit configurations
RATE_LIMITS = {
    "resend_verification": {"max_requests": 5, "window_seconds": 60},
    "forgot_password": {"max_requests": 5, "window_seconds": 60},
    "verify_email": {"max_requests": 20, "window_seconds": 60},
    "login": {"max_requests": 10, "window_seconds": 60},
    "register": {"max_requests": 5, "window_seconds": 60},
    "reset_password": {"max_requests": 5, "window_seconds": 60},
}


def get_client_ip(request: Request) -> str:
    """Get client IP from request, considering proxies."""
    # Check for forwarded headers (behind proxy/load balancer)
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        # X-Forwarded-For can contain multiple IPs, first is the client
        return forwarded.split(",")[0].strip()
    
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip
    
    # Fall back to direct connection IP
    if request.client:
        return request.client.host
    
    return "unknown"


def check_rate_limit(endpoint: str, request: Request):
    """
    Check rate limit for an endpoint.
    
    Args:
        endpoint: Endpoint identifier (must be in RATE_LIMITS)
        request: FastAPI request object
        
    Raises:
        HTTPException: If rate limit exceeded
    """
    if endpoint not in RATE_LIMITS:
        return
    
    config = RATE_LIMITS[endpoint]
    ip = get_client_ip(request)
    
    is_limited, remaining = rate_limiter.is_rate_limited(
        endpoint=endpoint,
        ip=ip,
        max_requests=config["max_requests"],
        window_seconds=config["window_seconds"],
    )
    
    if is_limited:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded for {endpoint}. Try again later.",
            headers={
                "Retry-After": str(config["window_seconds"]),
                "X-RateLimit-Limit": str(config["max_requests"]),
                "X-RateLimit-Remaining": "0",
            },
        )
