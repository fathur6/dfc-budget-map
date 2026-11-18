import { MonthlyBreakdownChart } from './MonthlyBreakdownChart.jsx'
import { statuses } from './editors.jsx'

const series = [
  { key: 'paidTotal', label: statuses.paid.label, color: '#59dbbf', shade: '#227d70' },
  { key: 'scheduledTotal', label: statuses.scheduled.label, color: '#f9c674', shade: '#a46c2d' },
  { key: 'missedTotal', label: statuses.missed.label, color: '#ff94a3', shade: '#a2445b' },
]

export function CommitmentChart({ months, summaries, month, chooseMonth }) {
  const entries = months.map((value, index) => ({
    month: value,
    total: summaries[index].committed,
    amounts: series.map(({ key }) => summaries[index][key]),
  }))

  return <MonthlyBreakdownChart entries={entries} series={series} month={month} chooseMonth={chooseMonth}
    title="Monthly commitment vs. payment" description="Amounts follow the payment month."
    overallTitle="Overall commitment" totalLabel="Total commitment" />
}
