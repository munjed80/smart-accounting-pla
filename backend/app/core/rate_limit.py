"""
Rate limiting for authentication endpoints.

Features:
- Redis-backed rate limiting for multi-instance deployments (when REDIS_URL is set)
- In-memory fallback for single-instance or development environments
- Per-IP rate limiting
- Configurable limits per endpoint
"""
import time
import logging
from collections import defaultdict
from typing import Dict, Tuple
from functools import wraps

from fastapi import HTTPException, Request, status

logger = logging.getLogger(__name__)


class InMemoryRateLimiter:
    """
    Simple in-memory rate limiter using sliding window algorithm.
    Used as fallback when Redis is not available.
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


class RedisRateLimiter:
    """
    Redis-backed rate limiter using sliding window counters.
    Safe for multi-instance / horizontally-scaled deployments.
    Falls back to in-memory if Redis becomes unavailable.
    """

    def __init__(self, redis_url: str):
        self._redis_url = redis_url
        self._redis = None
        self._fallback = InMemoryRateLimiter()
        self._init_redis()

    def _init_redis(self):
        """Initialize Redis connection (lazy, non-blocking)."""
        try:
            import redis as redis_lib
            self._redis = redis_lib.from_url(
                self._redis_url,
                decode_responses=True,
                socket_connect_timeout=2,
                socket_timeout=2,
            )
            # Quick connectivity test
            self._redis.ping()
            logger.info("Rate limiter connected to Redis")
        except Exception as exc:
            logger.warning(
                "Rate limiter failed to connect to Redis, using in-memory fallback: %s",
                exc,
            )
            self._redis = None

    def is_rate_limited(
        self,
        endpoint: str,
        ip: str,
        max_requests: int,
        window_seconds: int = 60,
    ) -> Tuple[bool, int]:
        """
        Check if request should be rate limited using Redis INCR + EXPIRE.

        Returns:
            Tuple of (is_limited, requests_remaining)
        """
        if self._redis is None:
            return self._fallback.is_rate_limited(endpoint, ip, max_requests, window_seconds)

        key = f"rl:{endpoint}:{ip}"
        try:
            pipe = self._redis.pipeline(transaction=True)
            pipe.incr(key)
            pipe.ttl(key)
            count, ttl = pipe.execute()

            # First request in window – set expiry
            if ttl == -1:
                self._redis.expire(key, window_seconds)

            if count > max_requests:
                logger.warning(
                    f"Rate limit exceeded for {endpoint}",
                    extra={
                        "event": "rate_limit_exceeded",
                        "endpoint": endpoint,
                        "ip": ip,
                        "total_requests": count,
                        "max_requests": max_requests,
                    },
                )
                return True, 0

            return False, max_requests - count
        except Exception as exc:
            logger.warning("Redis rate-limit error, falling back to in-memory: %s", exc)
            self._redis = None
            return self._fallback.is_rate_limited(endpoint, ip, max_requests, window_seconds)


def _create_rate_limiter():
    """Create the appropriate rate limiter based on configuration."""
    try:
        from app.core.config import get_settings
        settings = get_settings()
        if settings.redis_enabled:
            return RedisRateLimiter(settings.REDIS_URL)
    except Exception as exc:
        logger.debug("Could not load settings for rate limiter: %s", exc)
    return InMemoryRateLimiter()


# Global rate limiter instance
rate_limiter = _create_rate_limiter()


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
