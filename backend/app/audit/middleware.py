"""
Audit Middleware

This middleware captures request context and stores it in a context variable
for use by the audit logging system.
"""
import logging
from uuid import uuid4, UUID

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware

from app.audit.context import AuditContext, set_audit_context, clear_audit_context
from app.core.security import decode_token

logger = logging.getLogger(__name__)


class AuditMiddleware(BaseHTTPMiddleware):
    """
    Middleware to capture request context for audit logging.
    
    This middleware extracts:
    - request_id (generated UUID)
    - ip_address (from request.client.host)
    - user_id (from JWT token if present)
    - user_role (from JWT token if present, defaults to 'system')
    - client_id (from X-Selected-Client-Id header if present)
    
    The context is stored in a context variable and cleared after request processing.
    """
    
    async def dispatch(self, request: Request, call_next):
        """
        Process the request and set audit context.
        
        Args:
            request: The incoming request
            call_next: The next middleware/handler in the chain
            
        Returns:
            The response from the next handler
        """
        # Generate request ID
        request_id = uuid4()
        
        # Extract IP address
        ip_address = None
        if request.client:
            ip_address = request.client.host
        
        # Extract user information from JWT token
        user_id = None
        user_role = "system"
        
        # Try to get token from Authorization header
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]  # Remove "Bearer " prefix
            try:
                payload = decode_token(token)
                if payload:
                    # Extract user_id from 'sub' claim
                    user_id_str = payload.get("sub")
                    if user_id_str:
                        try:
                            user_id = UUID(user_id_str)
                        except (ValueError, TypeError):
                            logger.warning(f"Invalid user_id in token: {user_id_str}")
                    
                    # Extract role from 'role' claim
                    user_role = payload.get("role", "system")
            except Exception as e:
                # Token decode failure - log but continue with system defaults
                logger.debug(f"Could not decode token for audit context: {e}")
        
        # Extract active client_id from X-Selected-Client-Id header
        client_id = None
        client_id_header = request.headers.get("x-selected-client-id")
        if client_id_header:
            try:
                client_id = UUID(client_id_header)
            except (ValueError, TypeError):
                logger.warning(f"Invalid client_id in header: {client_id_header}")
        
        # Create and set audit context
        context = AuditContext(
            request_id=request_id,
            ip_address=ip_address,
            user_id=user_id,
            user_role=user_role,
            client_id=client_id,
        )
        set_audit_context(context)
        
        try:
            # Process the request
            response = await call_next(request)
            return response
        finally:
            # Always clear context after request
            clear_audit_context()
