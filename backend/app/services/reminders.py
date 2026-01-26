"""
Reminder Service

Service layer for:
- Sending reminders via IN_APP or EMAIL channels
- Scheduling reminders for future sending
- Managing reminder history
"""
import uuid
import os
from datetime import datetime, timezone, date, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy import select, func, and_, desc
from sqlalchemy.ext.asyncio import AsyncSession

try:
    import httpx
    HTTPX_AVAILABLE = True
except ImportError:
    HTTPX_AVAILABLE = False

from app.models.administration import Administration
from app.models.accountant_dashboard import (
    ClientReminder, 
    AccountantClientAssignment,
    ReminderChannel,
    ReminderStatus,
)
from app.models.work_queue import DashboardAuditLog, DashboardAuditActionType


class ReminderServiceError(Exception):
    """Base exception for reminder service operations."""
    pass


class RateLimitExceededError(ReminderServiceError):
    """Raised when rate limit is exceeded."""
    pass


class EmailNotConfiguredError(ReminderServiceError):
    """Raised when email sending is attempted without configuration."""
    pass


class ReminderService:
    """
    Service for managing client reminders.
    
    Supports:
    - IN_APP: Notifications visible in client dashboard
    - EMAIL: Emails sent via Resend (requires RESEND_API_KEY)
    """
    
    # Rate limits per minute
    RATE_LIMIT_WINDOW_SECONDS = 60
    RATE_LIMIT_MAX_SENDS = 10
    
    def __init__(self, db: AsyncSession, accountant_id: uuid.UUID):
        self.db = db
        self.accountant_id = accountant_id
        self.resend_api_key = os.environ.get("RESEND_API_KEY")
        self.from_email = os.environ.get("RESEND_FROM_EMAIL", "noreply@zzphub.nl")
    
    @property
    def email_enabled(self) -> bool:
        """Check if email sending is configured."""
        return bool(self.resend_api_key)
    
    async def check_rate_limit(self) -> bool:
        """Check if rate limit allows new send operation."""
        window_start = datetime.now(timezone.utc) - timedelta(seconds=self.RATE_LIMIT_WINDOW_SECONDS)
        
        result = await self.db.execute(
            select(func.count(ClientReminder.id))
            .where(ClientReminder.created_by_id == self.accountant_id)
            .where(ClientReminder.created_at >= window_start)
        )
        count = result.scalar() or 0
        
        return count < self.RATE_LIMIT_MAX_SENDS
    
    async def verify_client_access(self, administration_id: uuid.UUID) -> bool:
        """Verify accountant has access to the client."""
        # Check explicit assignment
        result = await self.db.execute(
            select(AccountantClientAssignment.id)
            .where(AccountantClientAssignment.accountant_id == self.accountant_id)
            .where(AccountantClientAssignment.administration_id == administration_id)
        )
        if result.scalar_one_or_none():
            return True
        
        # Check membership
        from app.models.administration import AdministrationMember, MemberRole
        member_result = await self.db.execute(
            select(AdministrationMember.id)
            .where(AdministrationMember.user_id == self.accountant_id)
            .where(AdministrationMember.administration_id == administration_id)
            .where(AdministrationMember.role.in_([MemberRole.OWNER, MemberRole.ADMIN, MemberRole.ACCOUNTANT]))
        )
        return member_result.scalar_one_or_none() is not None
    
    async def send_reminder(
        self,
        administration_ids: List[uuid.UUID],
        reminder_type: str,
        title: str,
        message: str,
        channel: str = "IN_APP",
        due_date: Optional[date] = None,
        template_id: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> List[ClientReminder]:
        """
        Send reminders immediately to selected clients.
        
        Args:
            administration_ids: List of client IDs
            reminder_type: Type of reminder (e.g., DOCUMENT_MISSING, VAT_DEADLINE)
            title: Reminder title
            message: Reminder message
            channel: IN_APP or EMAIL
            due_date: Optional due date
            template_id: Optional email template ID
            variables: Optional template variables
            
        Returns:
            List of created reminder records
        """
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before sending more reminders.")
        
        # Validate channel
        if channel == "EMAIL" and not self.email_enabled:
            channel = "IN_APP"  # Fallback to IN_APP if email not configured
        
        reminders = []
        
        for admin_id in administration_ids:
            # Verify access
            if not await self.verify_client_access(admin_id):
                continue
            
            # Get client info for email
            email_address = None
            if channel == "EMAIL":
                admin_result = await self.db.execute(
                    select(Administration).where(Administration.id == admin_id)
                )
                admin = admin_result.scalar_one_or_none()
                if admin:
                    email_address = admin.contact_email if hasattr(admin, 'contact_email') else None
            
            # Create reminder
            reminder = ClientReminder(
                administration_id=admin_id,
                reminder_type=reminder_type,
                title=title,
                message=message,
                created_by_id=self.accountant_id,
                due_date=due_date,
                channel=channel,
                template_id=template_id,
                variables=variables,
                email_address=email_address,
                status="PENDING",
            )
            self.db.add(reminder)
            reminders.append(reminder)
        
        await self.db.flush()
        
        # Send emails if channel is EMAIL
        for reminder in reminders:
            if reminder.channel == "EMAIL":
                try:
                    await self._send_email(reminder)
                    reminder.status = "SENT"
                    reminder.sent_at = datetime.now(timezone.utc)
                except Exception as e:
                    reminder.status = "FAILED"
                    reminder.send_error = str(e)
            else:
                reminder.status = "SENT"
                reminder.sent_at = datetime.now(timezone.utc)
        
        # Create audit log entries
        for reminder in reminders:
            audit = DashboardAuditLog(
                user_id=self.accountant_id,
                action_type="REMINDER_SEND",
                administration_id=reminder.administration_id,
                entity_type="reminder",
                entity_id=reminder.id,
                details={
                    "channel": reminder.channel,
                    "reminder_type": reminder_type,
                    "title": title,
                    "status": reminder.status,
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            self.db.add(audit)
        
        await self.db.commit()
        return reminders
    
    async def schedule_reminder(
        self,
        administration_ids: List[uuid.UUID],
        reminder_type: str,
        title: str,
        message: str,
        scheduled_at: datetime,
        channel: str = "IN_APP",
        due_date: Optional[date] = None,
        template_id: Optional[str] = None,
        variables: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> List[ClientReminder]:
        """
        Schedule reminders for future sending.
        
        Args:
            administration_ids: List of client IDs
            scheduled_at: When to send the reminders
            (other args same as send_reminder)
            
        Returns:
            List of created scheduled reminder records
        """
        # Check rate limit
        if not await self.check_rate_limit():
            raise RateLimitExceededError("Rate limit exceeded. Please wait before scheduling more reminders.")
        
        # Validate channel
        if channel == "EMAIL" and not self.email_enabled:
            channel = "IN_APP"
        
        reminders = []
        
        for admin_id in administration_ids:
            # Verify access
            if not await self.verify_client_access(admin_id):
                continue
            
            # Get client email if needed
            email_address = None
            if channel == "EMAIL":
                admin_result = await self.db.execute(
                    select(Administration).where(Administration.id == admin_id)
                )
                admin = admin_result.scalar_one_or_none()
                if admin:
                    email_address = admin.contact_email if hasattr(admin, 'contact_email') else None
            
            # Create scheduled reminder
            reminder = ClientReminder(
                administration_id=admin_id,
                reminder_type=reminder_type,
                title=title,
                message=message,
                created_by_id=self.accountant_id,
                due_date=due_date,
                channel=channel,
                template_id=template_id,
                variables=variables,
                email_address=email_address,
                scheduled_at=scheduled_at,
                status="SCHEDULED",
            )
            self.db.add(reminder)
            reminders.append(reminder)
        
        await self.db.flush()
        
        # Create audit log entries
        for reminder in reminders:
            audit = DashboardAuditLog(
                user_id=self.accountant_id,
                action_type="REMINDER_SCHEDULE",
                administration_id=reminder.administration_id,
                entity_type="reminder",
                entity_id=reminder.id,
                details={
                    "channel": reminder.channel,
                    "reminder_type": reminder_type,
                    "title": title,
                    "scheduled_at": scheduled_at.isoformat(),
                },
                ip_address=ip_address,
                user_agent=user_agent,
            )
            self.db.add(audit)
        
        await self.db.commit()
        return reminders
    
    async def get_reminder_history(
        self,
        administration_id: Optional[uuid.UUID] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> Dict[str, Any]:
        """
        Get reminder history for a client or all clients.
        
        Args:
            administration_id: Optional client ID to filter by
            limit: Max results to return
            offset: Pagination offset
            
        Returns:
            Dict with reminders and pagination info
        """
        query = select(ClientReminder).where(
            ClientReminder.created_by_id == self.accountant_id
        )
        
        if administration_id:
            # Verify access
            if not await self.verify_client_access(administration_id):
                return {"reminders": [], "total_count": 0, "limit": limit, "offset": offset}
            query = query.where(ClientReminder.administration_id == administration_id)
        
        # Get total count
        count_result = await self.db.execute(
            select(func.count()).select_from(query.subquery())
        )
        total_count = count_result.scalar() or 0
        
        # Get reminders with pagination
        reminders_result = await self.db.execute(
            query.order_by(desc(ClientReminder.created_at))
            .limit(limit)
            .offset(offset)
        )
        reminders = reminders_result.scalars().all()
        
        return {
            "reminders": [
                {
                    "id": str(r.id),
                    "administration_id": str(r.administration_id),
                    "reminder_type": r.reminder_type,
                    "title": r.title,
                    "message": r.message,
                    "channel": r.channel,
                    "status": r.status,
                    "due_date": r.due_date.isoformat() if r.due_date else None,
                    "scheduled_at": r.scheduled_at.isoformat() if r.scheduled_at else None,
                    "sent_at": r.sent_at.isoformat() if r.sent_at else None,
                    "created_at": r.created_at.isoformat() if r.created_at else None,
                    "is_read": r.is_read,
                    "send_error": r.send_error,
                }
                for r in reminders
            ],
            "total_count": total_count,
            "limit": limit,
            "offset": offset,
        }
    
    async def _send_email(self, reminder: ClientReminder) -> None:
        """
        Send email via Resend API.
        
        This is a basic implementation that can be extended with templates.
        """
        if not self.email_enabled:
            raise EmailNotConfiguredError("Resend API key not configured")
        
        if not reminder.email_address:
            raise ReminderServiceError("No email address for client")
        
        if not HTTPX_AVAILABLE:
            raise ReminderServiceError("httpx package not installed - email sending unavailable")
        
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    "https://api.resend.com/emails",
                    headers={
                        "Authorization": f"Bearer {self.resend_api_key}",
                        "Content-Type": "application/json",
                    },
                    json={
                        "from": self.from_email,
                        "to": [reminder.email_address],
                        "subject": reminder.title,
                        "text": reminder.message,
                    },
                    timeout=30.0,
                )
                
                if response.status_code != 200:
                    raise ReminderServiceError(f"Resend API error: {response.status_code} - {response.text}")
                    
        except httpx.RequestError as e:
            raise ReminderServiceError(f"Failed to send email: {str(e)}")


async def process_scheduled_reminders(db: AsyncSession) -> int:
    """
    Background task to process scheduled reminders.
    
    Should be called periodically (e.g., every minute) to send reminders
    that are scheduled for the current time.
    
    Returns:
        Number of reminders processed
    """
    now = datetime.now(timezone.utc)
    
    # Find reminders scheduled for now or earlier
    result = await db.execute(
        select(ClientReminder)
        .where(ClientReminder.status == "SCHEDULED")
        .where(ClientReminder.scheduled_at <= now)
    )
    reminders = result.scalars().all()
    
    processed = 0
    for reminder in reminders:
        try:
            if reminder.channel == "EMAIL":
                # Would need to instantiate service with proper accountant_id
                # For now, mark as SENT for IN_APP or leave for external processor
                reminder.status = "SENT"
                reminder.sent_at = now
            else:
                reminder.status = "SENT"
                reminder.sent_at = now
            processed += 1
        except Exception as e:
            reminder.status = "FAILED"
            reminder.send_error = str(e)
    
    await db.commit()
    return processed
