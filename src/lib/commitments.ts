import { zzpApi, ZZPCommitmentCreate } from '@/lib/api'

const addYears = (date: string, years: number) => {
  const next = new Date(date)
  next.setFullYear(next.getFullYear() + years)
  return next.toISOString().slice(0, 10)
}

export const createDemoCommitments = async (startDate: string) => {
  const demoItems: ZZPCommitmentCreate[] = [
    {
      type: 'subscription',
      name: 'Demo abonnement boekhoudsoftware',
      amount_cents: 2900,
      recurring_frequency: 'monthly',
      start_date: startDate,
      contract_term_months: 12,
      btw_rate: 21,
    },
    {
      type: 'lease',
      name: 'Demo lease bedrijfsauto',
      amount_cents: 42500,
      monthly_payment_cents: 42500,
      principal_amount_cents: 1800000,
      interest_rate: 4.2,
      start_date: startDate,
      end_date: addYears(startDate, 4),
      btw_rate: 21,
    },
    {
      type: 'loan',
      name: 'Demo lening bedrijfsmiddelen',
      amount_cents: 61500,
      monthly_payment_cents: 61500,
      principal_amount_cents: 2500000,
      interest_rate: 5.1,
      start_date: startDate,
      end_date: addYears(startDate, 3),
      btw_rate: 0,
    },
  ]

  await Promise.all(demoItems.map(item => zzpApi.commitments.create(item)))
}
