import { Tables } from '@/api/db/tables.ts'
import type { PayrollRun } from '@/api/model/payroll_run.ts'
import type { PayrollSnapshot } from '@/api/model/payroll_snapshot.ts'
import type { DbClient, LaborCalculationResult } from '@/lib/labor-engine/types.ts'
import { toEntityRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

export const createSnapshots = async (
  db: DbClient,
  run: PayrollRun,
  results: LaborCalculationResult[]
): Promise<PayrollSnapshot[]> => {
  const created: PayrollSnapshot[] = []

  for (const result of results) {
    const inserted = await db.create(Tables.payroll_snapshots, {
      payroll_run: toEntityRecordId(run.id),
      employee: toEntityRecordId(result.employeeId),
      pay_profile_id: toEntityRecordId(result.payProfileId) ?? null,
      regular_hours: result.hours.regularHours,
      overtime_hours: result.hours.overtimeHours,
      double_time_hours: result.hours.doubleTimeHours,
      night_premium_hours: result.hours.premiumBuckets
        .filter(b => b.type === 'night')
        .reduce((s, b) => s + b.hours, 0),
      weekend_premium_hours: result.hours.premiumBuckets
        .filter(b => b.type === 'weekend')
        .reduce((s, b) => s + b.hours, 0),
      holiday_premium_hours: result.hours.premiumBuckets
        .filter(b => b.type === 'holiday')
        .reduce((s, b) => s + b.hours, 0),
      regular_pay: result.cost.regularPay,
      overtime_pay: result.cost.overtimePay + result.cost.doubleTimePay,
      premium_pay: result.cost.premiumPay,
      bonuses: result.cost.bonuses,
      deductions: result.cost.deductions,
      adjustments: result.cost.adjustments,
      gross_pay: result.cost.grossPay,
      net_pay: result.cost.netPay,
      rule_applications: result.ruleApplications.map(r => ({
        rule_id: r.ruleId,
        rule_name: r.ruleName,
        effect: r.effect,
        amount: r.amount,
      })),
      calculated_at: nowSurrealDateTime(),
      calculation_version: result.calculationVersion,
    })

    created.push(unwrapRecord<PayrollSnapshot>(inserted))
  }

  return created
}
