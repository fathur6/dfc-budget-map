export const insightTypes = Object.freeze({
  loan_covers_shortfall: 'Loan proceeds cover a shortfall before borrowing.',
  loan_reduces_shortfall: 'A shortfall remains after loan proceeds.',
  surplus_before_loan: 'The month has a surplus before loan proceeds.',
  shortfall_before_loan: 'The month has a shortfall before loan proceeds.',
  break_even: 'The month breaks even before loan proceeds.',
  income_missing: 'Income is missing, so the result is unknown.',
  moved_to_later_month: 'Obligations originally due in the selected month are allocated to later months.',
  upcoming_shortfall: 'A later month in the forecast has a shortfall based on the entered figures.',
  spending_missing: 'No spending is entered for the selected month.',
})

export function validInsightTypes(types) {
  return Array.isArray(types) && types.length > 0 && types.length <= Object.keys(insightTypes).length
    && new Set(types).size === types.length
    && types.every(type => typeof type === 'string' && Object.hasOwn(insightTypes, type))
}

export function validInsightPlan(plan, types) {
  return plan != null && types.includes(plan.lead) && types.includes(plan.review)
}

export function monthlyInsightFacts(months, summaries, month, current) {
  const selected = summaries[months.indexOf(month)]
  const { beforeLoans, loanProceeds, balance } = selected
  let fundingType = 'income_missing'
  if (beforeLoans != null) {
    if (beforeLoans < 0 && loanProceeds > 0) {
      fundingType = balance < 0 ? 'loan_reduces_shortfall' : 'loan_covers_shortfall'
    } else {
      fundingType = beforeLoans < 0 ? 'shortfall_before_loan' : beforeLoans > 0 ? 'surplus_before_loan' : 'break_even'
    }
  }

  const facts = [{ type: fundingType, month, beforeLoans, loanProceeds, balance }]
  const moved = selected.movedOut.filter(entry => entry.paymentMonth > month && entry.amount > 0)
  if (moved.length > 0) {
    facts.push({
      type: 'moved_to_later_month', month,
      amount: moved.reduce((total, entry) => total + entry.amount, 0),
      destination: moved.every(entry => entry.paymentMonth === moved[0].paymentMonth) ? moved[0].paymentMonth : null,
    })
  }

  const next = months.findIndex((value, index) => value > month && value >= current && summaries[index].balance < 0)
  if (next >= 0) {
    facts.push({ type: 'upcoming_shortfall', month: months[next], amount: -summaries[next].balance })
  }
  if (!selected.hasSpending) facts.push({ type: 'spending_missing', month })
  return facts
}

export const demoInsightFacts = [
  { type: 'loan_covers_shortfall', month: '2026-11', beforeLoans: -225504, loanProceeds: 240000, balance: 14496 },
  { type: 'moved_to_later_month', month: '2026-11', destination: '2026-12', amount: 189500 },
  { type: 'upcoming_shortfall', month: '2026-12', amount: 193099 },
]
