import { PREPAID_PLANS, type PrepaidPlanCode } from '@/lib/billingCatalog'
import { ArrowUpRight, Check } from 'lucide-react'

export function PrepaidPlanCards({ onChoose, disabled = false }: {
  onChoose?: (code: PrepaidPlanCode) => void
  disabled?: boolean
}) {
  return (
    <div className="prepaid-plans">
      {PREPAID_PLANS.map(plan => (
        <article className={`prepaid-plan ${plan.months === 12 ? 'prepaid-plan--annual' : ''}`} key={plan.code}>
          <div className="prepaid-plan-top"><h3>{plan.label}</h3>{plan.months === 12 && <span>Voordeligste looptijd</span>}</div>
          <p className="prepaid-plan-price">{plan.price}<span>eenmalig</span></p>
          <p className="prepaid-plan-equivalent">{plan.months === 1 ? 'Eén maand toegang' : `${plan.monthlyEquivalent} per maand, vooruitbetaald`}</p>
          <p className="prepaid-plan-features"><Check size={16} aria-hidden="true" /> Alle ZZP-functies inbegrepen</p>
          {onChoose && <button type="button" onClick={() => onChoose(plan.code)} disabled={disabled} className="prepaid-plan-button">
            {disabled ? 'Even geduld…' : `${plan.label} kopen`}<ArrowUpRight size={16} aria-hidden="true" />
          </button>}
        </article>
      ))}
    </div>
  )
}
