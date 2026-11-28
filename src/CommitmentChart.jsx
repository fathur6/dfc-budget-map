import { t } from './preferences.js'
import { MonthlyBreakdownChart } from './MonthlyBreakdownChart.jsx'
import { statuses } from './editors.jsx'

const paymentSeries = [
  { key: 'paidTotal', label: statuses.paid.label, color: '#59dbbf', shade: '#227d70' },
  { key: 'scheduledTotal', label: statuses.scheduled.label, color: '#f9c674', shade: '#a46c2d' },
  { key: 'missedTotal', label: statuses.missed.label, color: '#ff94a3', shade: '#a2445b' },
]
const spendingSeries = { key: 'recordedTotal', label: statuses.recorded.label, color: '#8bbdf7', shade: '#416caa' }

export function CommitmentChart({ months, summaries, month, chooseMonth, compact }) {
  const series = summaries.some(summary => summary.recordedTotal > 0) ? [...paymentSeries, spendingSeries] : paymentSeries
  const entries = months.map((value, index) => ({
    month: value,
    total: summaries[index].committed,
    amounts: series.map(({ key }) => summaries[index][key]),
  }))

  return <MonthlyBreakdownChart entries={entries} series={series} month={month} chooseMonth={chooseMonth} compact={compact}
    title={t("Monthly commitment vs. payment")} description={t("Payments in the salary window count toward their budget month.")}
    overallTitle={t("Overall commitment")} totalLabel={t("Total commitment")} />
}
