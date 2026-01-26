"""
Ops Safeguards Service

Provides protective checks for operations:
- Soft rate-limits on heavy operations (recalculate, VAT report)
- Idempotent retries with exponential backoff for background tasks
- Clear error surfaces (no silent failures)
"""
import asyncio
import json
from datetime import datetime, timezone, timedelta
from functools import wraps
from typing import Optional, Callable, Any, TypeVar
from uuid import UUID
import random

from app.services.logging import accounting_logger

T = TypeVar('T')


class RateLimitExceeded(Exception):
    """Raised when rate limit is exceeded."""
    def __init__(self, operation: str, retry_after_seconds: int):
        self.operation = operation
        self.retry_after_seconds = retry_after_seconds
        super().__init__(f"Rate limit exceeded for {operation}. Retry after {retry_after_seconds} seconds.")


class OperationFailed(Exception):
    """Raised when an operation fails after all retries."""
    def __init__(self, operation: str, error: str, retry_count: int):
        self.operation = operation
        self.error = error
        self.retry_count = retry_count
        super().__init__(f"Operation '{operation}' failed after {retry_count} retries: {error}")


class RateLimiter:
    """
    Simple in-memory rate limiter for heavy operations.
    
    Note: This is a per-process limiter. For multi-process deployments,
    consider using Redis for distributed rate limiting.
    """
    
    # Rate limit configuration: operation -> (max_calls, window_seconds)
    LIMITS = {
        "recalculate": (5, 60),      # 5 calls per minute
        "vat_report": (10, 60),       # 10 calls per minute
        "document_reprocess": (20, 60),  # 20 calls per minute
        "period_finalize": (3, 300),  # 3 calls per 5 minutes
        "bulk_post": (5, 60),         # 5 bulk posts per minute
    }
    
    def __init__(self):
        self._calls: dict[str, list[datetime]] = {}
    
    def _clean_old_calls(self, operation: str, window_seconds: int):
        """Remove calls outside the window."""
        if operation not in self._calls:
            self._calls[operation] = []
            return
        
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=window_seconds)
        self._calls[operation] = [
            ts for ts in self._calls[operation]
            if ts > cutoff
        ]
    
    def check_rate_limit(
        self,
        operation: str,
        client_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
    ) -> bool:
        """
        Check if operation is within rate limits.
        
        Returns True if within limits, raises RateLimitExceeded if exceeded.
        """
        # Use operation + client as key for per-client limits
        key = f"{operation}:{client_id}" if client_id else operation
        
        if operation not in self.LIMITS:
            return True  # No limit defined, allow
        
        max_calls, window_seconds = self.LIMITS[operation]
        
        self._clean_old_calls(key, window_seconds)
        
        if len(self._calls.get(key, [])) >= max_calls:
            # Calculate retry after
            oldest_call = min(self._calls[key])
            retry_after = window_seconds - int((datetime.now(timezone.utc) - oldest_call).total_seconds())
            retry_after = max(1, retry_after)  # At least 1 second
            
            # Log the rate limit event
            accounting_logger.rate_limit_exceeded(
                operation=operation,
                client_id=client_id,
                user_id=user_id,
                limit=max_calls
            )
            
            raise RateLimitExceeded(operation, retry_after)
        
        # Record this call
        if key not in self._calls:
            self._calls[key] = []
        self._calls[key].append(datetime.now(timezone.utc))
        
        return True
    
    def get_remaining_calls(self, operation: str, client_id: Optional[UUID] = None) -> int:
        """Get remaining calls within the rate limit window."""
        key = f"{operation}:{client_id}" if client_id else operation
        
        if operation not in self.LIMITS:
            return -1  # No limit
        
        max_calls, window_seconds = self.LIMITS[operation]
        self._clean_old_calls(key, window_seconds)
        
        return max(0, max_calls - len(self._calls.get(key, [])))


# Global rate limiter instance
rate_limiter = RateLimiter()


class RetryConfig:
    """Configuration for exponential backoff retries."""
    
    def __init__(
        self,
        max_retries: int = 3,
        initial_delay: float = 1.0,
        max_delay: float = 60.0,
        exponential_base: float = 2.0,
        jitter: bool = True,
    ):
        self.max_retries = max_retries
        self.initial_delay = initial_delay
        self.max_delay = max_delay
        self.exponential_base = exponential_base
        self.jitter = jitter
    
    def get_delay(self, retry_count: int) -> float:
        """Calculate delay for a given retry count."""
        delay = self.initial_delay * (self.exponential_base ** retry_count)
        delay = min(delay, self.max_delay)
        
        if self.jitter:
            # Add random jitter up to 25% of delay
            jitter_amount = delay * 0.25 * random.random()
            delay += jitter_amount
        
        return delay


# Default retry configs for different operation types
RETRY_CONFIGS = {
    "default": RetryConfig(max_retries=3, initial_delay=1.0),
    "document_processing": RetryConfig(max_retries=5, initial_delay=2.0, max_delay=120.0),
    "database_operation": RetryConfig(max_retries=3, initial_delay=0.5, max_delay=10.0),
    "external_service": RetryConfig(max_retries=5, initial_delay=2.0, max_delay=60.0),
}


async def retry_with_backoff(
    operation: Callable[..., T],
    *args,
    operation_name: str = "operation",
    config: Optional[RetryConfig] = None,
    client_id: Optional[UUID] = None,
    on_retry: Optional[Callable[[Exception, int], None]] = None,
    **kwargs,
) -> T:
    """
    Execute an operation with exponential backoff retry.
    
    Args:
        operation: Async callable to execute
        operation_name: Name for logging
        config: Retry configuration
        client_id: Optional client ID for logging
        on_retry: Optional callback called on each retry with (exception, retry_count)
        *args, **kwargs: Arguments passed to operation
    
    Returns:
        Result of the operation
    
    Raises:
        OperationFailed: If all retries are exhausted
    """
    if config is None:
        config = RETRY_CONFIGS["default"]
    
    last_error = None
    
    for retry_count in range(config.max_retries + 1):
        try:
            result = await operation(*args, **kwargs)
            return result
        except Exception as e:
            last_error = e
            
            if retry_count >= config.max_retries:
                # Max retries reached
                accounting_logger.operation_failed(
                    operation=operation_name,
                    error=str(e),
                    client_id=client_id,
                    retry_count=retry_count
                )
                raise OperationFailed(operation_name, str(e), retry_count)
            
            # Calculate delay and wait
            delay = config.get_delay(retry_count)
            
            if on_retry:
                on_retry(e, retry_count)
            
            await asyncio.sleep(delay)
    
    # Should not reach here, but just in case
    raise OperationFailed(operation_name, str(last_error), config.max_retries)


def with_retry(
    operation_name: str,
    config_name: str = "default",
):
    """
    Decorator for adding retry with backoff to async functions.
    
    Usage:
        @with_retry("document_processing", "document_processing")
        async def process_document(doc_id: UUID) -> Document:
            ...
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> T:
            config = RETRY_CONFIGS.get(config_name, RETRY_CONFIGS["default"])
            return await retry_with_backoff(
                func,
                *args,
                operation_name=operation_name,
                config=config,
                **kwargs
            )
        return wrapper
    return decorator


class IdempotencyChecker:
    """
    Simple idempotency checker using in-memory cache.
    
    Tracks operation IDs to prevent duplicate processing.
    For production, use Redis or database for distributed idempotency.
    """
    
    def __init__(self, ttl_seconds: int = 3600):
        self._operations: dict[str, datetime] = {}
        self.ttl_seconds = ttl_seconds
    
    def _clean_expired(self):
        """Remove expired operation IDs."""
        cutoff = datetime.now(timezone.utc) - timedelta(seconds=self.ttl_seconds)
        self._operations = {
            k: v for k, v in self._operations.items()
            if v > cutoff
        }
    
    def check_and_set(self, operation_id: str) -> bool:
        """
        Check if operation was already processed.
        
        Returns True if this is a new operation (not seen before).
        Returns False if operation was already processed.
        """
        self._clean_expired()
        
        if operation_id in self._operations:
            return False  # Already processed
        
        self._operations[operation_id] = datetime.now(timezone.utc)
        return True  # New operation
    
    def was_processed(self, operation_id: str) -> bool:
        """Check if operation was already processed."""
        self._clean_expired()
        return operation_id in self._operations
    
    def mark_processed(self, operation_id: str):
        """Mark an operation as processed."""
        self._operations[operation_id] = datetime.now(timezone.utc)


# Global idempotency checker
idempotency_checker = IdempotencyChecker()


class OperationContext:
    """
    Context manager for safe operation execution with rate limiting,
    idempotency checks, and clear error surfacing.
    
    Usage:
        async with OperationContext(
            operation_name="recalculate",
            client_id=client_id,
            operation_id=f"recalc-{client_id}-{timestamp}"
        ) as ctx:
            result = await do_recalculation()
            ctx.set_result(result)
    """
    
    def __init__(
        self,
        operation_name: str,
        client_id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        operation_id: Optional[str] = None,
        check_rate_limit: bool = True,
        check_idempotency: bool = False,
    ):
        self.operation_name = operation_name
        self.client_id = client_id
        self.user_id = user_id
        self.operation_id = operation_id
        self.check_rate_limit = check_rate_limit
        self.check_idempotency = check_idempotency
        
        self._result = None
        self._error = None
        self._start_time = None
    
    async def __aenter__(self):
        self._start_time = datetime.now(timezone.utc)
        
        # Check rate limit
        if self.check_rate_limit:
            rate_limiter.check_rate_limit(
                self.operation_name,
                self.client_id,
                self.user_id
            )
        
        # Check idempotency
        if self.check_idempotency and self.operation_id:
            if not idempotency_checker.check_and_set(self.operation_id):
                raise ValueError(f"Operation {self.operation_id} was already processed")
        
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if exc_val is not None:
            self._error = str(exc_val)
            
            # Log the error
            accounting_logger.operation_failed(
                operation=self.operation_name,
                error=self._error,
                client_id=self.client_id,
                retry_count=0
            )
        
        # Don't suppress exceptions
        return False
    
    def set_result(self, result: Any):
        """Set the operation result."""
        self._result = result
    
    @property
    def duration_seconds(self) -> Optional[float]:
        """Get operation duration in seconds."""
        if self._start_time:
            return (datetime.now(timezone.utc) - self._start_time).total_seconds()
        return None


# Utility functions

def check_rate_limit(
    operation: str,
    client_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
) -> bool:
    """
    Check rate limit for an operation.
    
    Convenience function that wraps the global rate limiter.
    """
    return rate_limiter.check_rate_limit(operation, client_id, user_id)


def get_remaining_calls(operation: str, client_id: Optional[UUID] = None) -> int:
    """Get remaining calls for an operation."""
    return rate_limiter.get_remaining_calls(operation, client_id)


async def safe_operation(
    operation: Callable[..., T],
    *args,
    operation_name: str,
    client_id: Optional[UUID] = None,
    user_id: Optional[UUID] = None,
    check_rate_limit: bool = True,
    retry_config: Optional[RetryConfig] = None,
    **kwargs,
) -> T:
    """
    Execute an operation with all safeguards enabled.
    
    Combines rate limiting, retries, and error logging.
    """
    # Check rate limit first
    if check_rate_limit:
        rate_limiter.check_rate_limit(operation_name, client_id, user_id)
    
    # Execute with retry
    return await retry_with_backoff(
        operation,
        *args,
        operation_name=operation_name,
        config=retry_config,
        client_id=client_id,
        **kwargs
    )
