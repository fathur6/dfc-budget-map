import { MonthlyBreakdownChart } from './MonthlyBreakdownChart.jsx'

const categories = [
  { label: 'Food & household', color: '#59dbbf', shade: '#227d70' },
  { label: 'Family support', color: '#94c6ff', shade: '#3d6ea8' },
  { label: 'Transport', color: '#f9c674', shade: '#a46c2d' },
  { label: 'Childcare', color: '#c8aaff', shade: '#7755ad' },
  { label: 'Insurance', color: '#ff94a3', shade: '#a2445b' },
  { label: 'Education', color: '#b5d57a', shade: '#5f8136' },
  { label: 'Subscriptions', color: '#6ed8ef', shade: '#277d9f' },
  { label: 'Other', color: '#efa286', shade: '#98553e' },
  { label: 'Uncategorized', color: '#bac7d4', shade: '#5f7387' },
]

export function SpendingChart({ months, summaries, month, chooseMonth }) {
  const series = categories.filter(({ label }) => summaries.some(summary => summary.spendingByCategory.get(label) > 0))
  const entries = months.map((value, index) => ({
    month: value,
    total: summaries[index].spent,
    amounts: series.map(({ label }) => summaries[index].spendingByCategory.get(label) ?? 0),
  }))

  return <MonthlyBreakdownChart entries={entries} series={series} month={month} chooseMonth={chooseMonth}
    title="Monthly spending by category" description="Shows recorded spending."
    overallTitle="Overall spending" totalLabel="Total spending"
    highlightsTitle="Category breakdown" emptyLabel="No spending recorded" />
}
