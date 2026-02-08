"""
ZZP AI Insights Service

Generates intelligent, explainable insights for ZZP users.
All AI logic is rule-based and transparent - no black-box magic.

Design Principles:
1. AI assists, never blocks - all insights are suggestions
2. Explainable - every insight shows WHY it was generated
3. Human can override - user can dismiss or take alternative action
4. Simple rules - start simple, extensible design
"""
import uuid
from datetime import datetime, date, timedelta
from decimal import Decimal
from typing import List, Optional
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.zzp import (
    ZZPInvoice, 
    ZZPTimeEntry, 
    ZZPExpense, 
    ZZPCustomer,
    BusinessProfile,
    InvoiceStatus,
)
from app.schemas.zzp import (
    ZZPInsight,
    ZZPInsightsResponse,
    InsightType,
    InsightSeverity,
    InsightAction,
)


class ZZPInsightsService:
    """
    AI Insights service for ZZP users.
    
    Generates actionable insights based on explicit business rules.
    Each rule is documented and explainable.
    """
    
    # Rule thresholds (configurable)
    OVERDUE_DAYS_WARNING = 7    # Yellow after 7 days overdue
    OVERDUE_DAYS_URGENT = 14    # Red after 14 days overdue
    UNBILLED_HOURS_MIN = 1.0    # Minimum hours to suggest invoice
    UNBILLED_HOURS_MIN_AMOUNT = 5000  # Minimum 50 EUR to suggest invoice
    BTW_DEADLINE_WARNING_DAYS = 14  # Warn 14 days before BTW deadline
    INACTIVITY_DAYS = 30        # Warn if no activity for 30 days
    
    def __init__(self, db: AsyncSession, administration_id: uuid.UUID):
        self.db = db
        self.administration_id = administration_id
    
    async def generate_insights(self) -> ZZPInsightsResponse:
        """
        Generate all insights for the ZZP user.
        
        Rules are applied in priority order:
        1. Overdue invoices (ACTION_NEEDED)
        2. Missing business profile (ACTION_NEEDED)
        3. Invoices needing follow-up (SUGGESTION)
        4. Unbilled hours (SUGGESTION)
        5. BTW deadline approaching (SUGGESTION)
        6. No recent activity (INFO)
        """
        insights: List[ZZPInsight] = []
        
        # Generate insights from each rule
        insights.extend(await self._check_overdue_invoices())
        insights.extend(await self._check_missing_profile())
        insights.extend(await self._check_invoice_followup())
        insights.extend(await self._check_unbilled_hours())
        insights.extend(await self._check_btw_deadline())
        insights.extend(await self._check_no_recent_activity())
        
        # Count by severity
        action_needed = sum(1 for i in insights if i.severity == InsightSeverity.ACTION_NEEDED)
        suggestions = sum(1 for i in insights if i.severity == InsightSeverity.SUGGESTION)
        
        return ZZPInsightsResponse(
            insights=insights,
            total_action_needed=action_needed,
            total_suggestions=suggestions,
            generated_at=datetime.utcnow(),
            ai_model_version="rules-v1",
        )
    
    async def _check_overdue_invoices(self) -> List[ZZPInsight]:
        """
        Rule: Detect overdue invoices that need immediate attention.
        
        Logic:
        - Invoice status is 'sent' (not draft, paid, or cancelled)
        - Due date has passed
        - Severity based on how long overdue:
          - 7+ days: ACTION_NEEDED
          - 14+ days: ACTION_NEEDED (urgent wording)
        """
        insights = []
        today = date.today()
        
        # Get sent invoices with past due date
        result = await self.db.execute(
            select(ZZPInvoice)
            .where(ZZPInvoice.administration_id == self.administration_id)
            .where(ZZPInvoice.status == InvoiceStatus.SENT.value)
            .where(ZZPInvoice.due_date < today)
        )
        overdue_invoices = result.scalars().all()
        
        for invoice in overdue_invoices:
            days_overdue = (today - invoice.due_date).days
            
            if days_overdue >= self.OVERDUE_DAYS_URGENT:
                # Urgent overdue
                insights.append(ZZPInsight(
                    id=f"overdue-urgent-{invoice.id}",
                    type=InsightType.INVOICE_OVERDUE,
                    severity=InsightSeverity.ACTION_NEEDED,
                    title=f"Factuur {invoice.invoice_number} is {days_overdue} dagen te laat",
                    description=f"Deze factuur van €{invoice.total_cents/100:.2f} had {days_overdue} dagen geleden betaald moeten zijn. Direct actie vereist.",
                    reason=f"AI detectie: Factuur verstuurd op {invoice.issue_date}, vervaldatum was {invoice.due_date}. Nu {days_overdue} dagen te laat.",
                    action=InsightAction(
                        type="mark_paid_or_followup",
                        label="Bekijken",
                        route="/zzp/invoices",
                        params={"highlight": str(invoice.id)},
                    ),
                    related_id=str(invoice.id),
                    related_type="invoice",
                    amount_cents=invoice.total_cents,
                ))
            elif days_overdue >= self.OVERDUE_DAYS_WARNING:
                # Warning overdue
                insights.append(ZZPInsight(
                    id=f"overdue-{invoice.id}",
                    type=InsightType.INVOICE_OVERDUE,
                    severity=InsightSeverity.ACTION_NEEDED,
                    title=f"Factuur {invoice.invoice_number} is te laat",
                    description=f"Deze factuur van €{invoice.total_cents/100:.2f} is {days_overdue} dagen over de vervaldatum.",
                    reason=f"AI detectie: Factuur status is 'verstuurd' maar vervaldatum ({invoice.due_date}) is gepasseerd.",
                    action=InsightAction(
                        type="mark_paid_or_followup",
                        label="Actie ondernemen",
                        route="/zzp/invoices",
                        params={"highlight": str(invoice.id)},
                    ),
                    related_id=str(invoice.id),
                    related_type="invoice",
                    amount_cents=invoice.total_cents,
                ))
        
        return insights
    
    async def _check_missing_profile(self) -> List[ZZPInsight]:
        """
        Rule: Check if business profile is complete.
        
        Logic:
        - Profile should exist
        - Key fields should be filled: company_name, kvk_number, btw_number, iban
        """
        result = await self.db.execute(
            select(BusinessProfile)
            .where(BusinessProfile.administration_id == self.administration_id)
        )
        profile = result.scalar_one_or_none()
        
        if not profile:
            return [ZZPInsight(
                id="missing-profile",
                type=InsightType.MISSING_PROFILE,
                severity=InsightSeverity.ACTION_NEEDED,
                title="Bedrijfsprofiel ontbreekt",
                description="Vul je bedrijfsgegevens in om professionele facturen te kunnen versturen.",
                reason="AI detectie: Geen bedrijfsprofiel gevonden. Dit is vereist voor facturen.",
                action=InsightAction(
                    type="complete_profile",
                    label="Profiel invullen",
                    route="/zzp/settings",
                ),
            )]
        
        # Check for missing required fields
        missing = []
        if not profile.company_name:
            missing.append("bedrijfsnaam")
        if not profile.kvk_number:
            missing.append("KVK-nummer")
        if not profile.btw_number:
            missing.append("BTW-nummer")
        if not profile.iban:
            missing.append("IBAN")
        
        if missing:
            return [ZZPInsight(
                id="incomplete-profile",
                type=InsightType.MISSING_PROFILE,
                severity=InsightSeverity.SUGGESTION,
                title="Bedrijfsprofiel incompleet",
                description=f"Vul de volgende velden in: {', '.join(missing)}",
                reason=f"AI detectie: Profiel mist belangrijke velden voor professionele facturen.",
                action=InsightAction(
                    type="complete_profile",
                    label="Aanvullen",
                    route="/zzp/settings",
                ),
            )]
        
        return []
    
    async def _check_invoice_followup(self) -> List[ZZPInsight]:
        """
        Rule: Detect invoices that may need a reminder.
        
        Logic:
        - Invoice status is 'sent'
        - Sent more than 7 days ago
        - Not yet overdue (due_date is still in future or just passed < 7 days)
        """
        insights = []
        today = date.today()
        seven_days_ago = today - timedelta(days=7)
        
        # Get sent invoices that were sent > 7 days ago but not heavily overdue
        result = await self.db.execute(
            select(ZZPInvoice)
            .where(ZZPInvoice.administration_id == self.administration_id)
            .where(ZZPInvoice.status == InvoiceStatus.SENT.value)
            .where(ZZPInvoice.issue_date <= seven_days_ago)
            .where(or_(
                ZZPInvoice.due_date >= today,  # Not yet due
                ZZPInvoice.due_date >= today - timedelta(days=self.OVERDUE_DAYS_WARNING)  # Recently overdue (not heavily)
            ))
        )
        invoices = result.scalars().all()
        
        for invoice in invoices:
            days_since_sent = (today - invoice.issue_date).days
            
            # Skip if already in overdue list (overlaps with _check_overdue_invoices)
            # Using OVERDUE_DAYS_WARNING - 1 to ensure no gap between follow-up and overdue thresholds
            if invoice.due_date and invoice.due_date < today - timedelta(days=self.OVERDUE_DAYS_WARNING - 1):
                continue
                
            insights.append(ZZPInsight(
                id=f"followup-{invoice.id}",
                type=InsightType.INVOICE_FOLLOWUP,
                severity=InsightSeverity.SUGGESTION,
                title=f"Herinnering voor factuur {invoice.invoice_number}?",
                description=f"Deze factuur (€{invoice.total_cents/100:.2f}) is {days_since_sent} dagen geleden verstuurd. Overweeg een betaalherinnering.",
                reason=f"AI suggestie: Factuur verstuurd op {invoice.issue_date}, nog niet betaald na {days_since_sent} dagen.",
                action=InsightAction(
                    type="send_reminder",
                    label="Bekijken",
                    route="/zzp/invoices",
                    params={"highlight": str(invoice.id)},
                ),
                related_id=str(invoice.id),
                related_type="invoice",
                amount_cents=invoice.total_cents,
            ))
        
        return insights
    
    async def _check_unbilled_hours(self) -> List[ZZPInsight]:
        """
        Rule: Detect billable hours that haven't been invoiced.
        
        Logic:
        - Time entries marked as billable
        - Have an hourly rate
        - Group by customer
        - Suggest invoice if total > threshold
        """
        insights = []
        
        # Get customers with billable hours
        result = await self.db.execute(
            select(
                ZZPTimeEntry.customer_id,
                func.sum(ZZPTimeEntry.hours).label('total_hours'),
                func.sum(
                    ZZPTimeEntry.hours * ZZPTimeEntry.hourly_rate_cents
                ).label('total_amount_cents')
            )
            .where(ZZPTimeEntry.administration_id == self.administration_id)
            .where(ZZPTimeEntry.billable.is_(True))
            .where(ZZPTimeEntry.customer_id.isnot(None))
            .where(ZZPTimeEntry.hourly_rate_cents.isnot(None))
            .group_by(ZZPTimeEntry.customer_id)
        )
        rows = result.all()
        
        for row in rows:
            customer_id, total_hours, total_amount_cents = row
            
            # Skip if below threshold
            if total_hours < self.UNBILLED_HOURS_MIN:
                continue
            if total_amount_cents and total_amount_cents < self.UNBILLED_HOURS_MIN_AMOUNT:
                continue
            
            # Get customer name
            customer_result = await self.db.execute(
                select(ZZPCustomer)
                .where(ZZPCustomer.id == customer_id)
            )
            customer = customer_result.scalar_one_or_none()
            customer_name = customer.name if customer else "Onbekende klant"
            
            total_amount = int(total_amount_cents) if total_amount_cents else 0
            
            insights.append(ZZPInsight(
                id=f"unbilled-{customer_id}",
                type=InsightType.UNBILLED_HOURS,
                severity=InsightSeverity.SUGGESTION,
                title=f"Maak factuur voor {customer_name}",
                description=f"{total_hours:.1f} uur aan factureerbare uren (€{total_amount/100:.2f}) wacht op facturatie.",
                reason=f"AI suggestie: {total_hours:.1f} billable uren geregistreerd voor {customer_name} met een totaalwaarde van €{total_amount/100:.2f}.",
                action=InsightAction(
                    type="create_invoice_from_hours",
                    label="Factureren",
                    route="/zzp/time",
                    params={"customer_id": str(customer_id)},
                ),
                related_id=str(customer_id),
                related_type="customer",
                amount_cents=total_amount,
            ))
        
        return insights
    
    async def _check_btw_deadline(self) -> List[ZZPInsight]:
        """
        Rule: Warn about upcoming BTW (VAT) deadlines.
        
        Logic:
        - Dutch BTW is filed quarterly
        - Deadline is typically end of month after quarter
        - Warn 14 days before deadline
        """
        today = date.today()
        
        # Determine current quarter and deadline
        quarter = (today.month - 1) // 3 + 1
        year = today.year
        
        # For Q4 deadline, the year for the deadline depends on when we're checking
        # If we're in January checking Q4, the deadline is this year's January
        # If we're in Q4 (Oct-Dec), the deadline is next year's January
        q4_deadline_year = year + 1 if today.month >= 10 else year
        
        # BTW filing deadlines (end of month after quarter)
        btw_deadlines = {
            1: date(year, 4, 30),   # Q1 deadline: April 30
            2: date(year, 7, 31),   # Q2 deadline: July 31
            3: date(year, 10, 31),  # Q3 deadline: October 31
            4: date(q4_deadline_year, 1, 31),  # Q4 deadline: January 31 (next year if in Q4)
        }
        
        deadline = btw_deadlines[quarter]
        days_until = (deadline - today).days
        
        if 0 < days_until <= self.BTW_DEADLINE_WARNING_DAYS:
            return [ZZPInsight(
                id=f"btw-deadline-q{quarter}",
                type=InsightType.BTW_DEADLINE,
                severity=InsightSeverity.SUGGESTION,
                title=f"BTW aangifte Q{quarter} nadert",
                description=f"De BTW aangifte deadline is over {days_until} dagen ({deadline.strftime('%d %B %Y')}). Controleer of al je facturen en uitgaven zijn verwerkt.",
                reason=f"AI herinnering: Nederlandse BTW deadline voor Q{quarter} is {deadline}. Nog {days_until} dagen.",
                action=InsightAction(
                    type="check_btw",
                    label="BTW controleren",
                    route="/zzp/expenses",
                ),
            )]
        
        return []
    
    async def _check_no_recent_activity(self) -> List[ZZPInsight]:
        """
        Rule: Detect if there's been no activity for a while.
        
        Logic:
        - Check last invoice, expense, or time entry
        - If all are > 30 days old, suggest activity
        """
        today = date.today()
        threshold = today - timedelta(days=self.INACTIVITY_DAYS)
        
        # Check latest activity across different entities
        latest_invoice = await self.db.execute(
            select(func.max(ZZPInvoice.created_at))
            .where(ZZPInvoice.administration_id == self.administration_id)
        )
        latest_expense = await self.db.execute(
            select(func.max(ZZPExpense.created_at))
            .where(ZZPExpense.administration_id == self.administration_id)
        )
        latest_time = await self.db.execute(
            select(func.max(ZZPTimeEntry.created_at))
            .where(ZZPTimeEntry.administration_id == self.administration_id)
        )
        
        inv_date = latest_invoice.scalar()
        exp_date = latest_expense.scalar()
        time_date = latest_time.scalar()
        
        # Find most recent activity
        dates = [d for d in [inv_date, exp_date, time_date] if d]
        
        if not dates:
            # No activity at all - might be new user, skip this insight
            return []
        
        most_recent = max(dates)
        if most_recent.date() < threshold:
            days_inactive = (today - most_recent.date()).days
            return [ZZPInsight(
                id="no-recent-activity",
                type=InsightType.NO_RECENT_ACTIVITY,
                severity=InsightSeverity.INFO,
                title="Geen recente activiteit",
                description=f"Je hebt al {days_inactive} dagen geen facturen, uitgaven of uren geregistreerd. Vergeet niet je administratie bij te houden!",
                reason=f"AI detectie: Laatste activiteit was {days_inactive} dagen geleden op {most_recent.date()}.",
                action=InsightAction(
                    type="add_activity",
                    label="Uren registreren",
                    route="/zzp/time",
                ),
            )]
        
        return []
