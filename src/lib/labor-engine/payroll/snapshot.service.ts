import { Tables } from '@/api/db/tables.ts'
import type { PayrollRun } from '@/api/model/payroll_run.ts'
import type { PayrollSnapshot } from '@/api/model/payroll_snapshot.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient, LaborCalculationResult } from '@/lib/labor-engine/types.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'
import { safeNumber, toRecordId } from '@/lib/utils.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

const roundMoney = (value: number): number =>
  Math.round((value + Number.EPSILON) * 100) / 100

const snapshotEmployeeId = (snapshot: PayrollSnapshot): string => {
  const employee = snapshot.employee as unknown
  if (employee && typeof employee === 'object' && 'id' in employee) {
    return String((employee as { id: string }).id)
  }
  return String(employee ?? '')
}

const snapshotPayloadFromResult = (
  run: PayrollRun,
  result: LaborCalculationResult
) => ({
  payroll_run: toEntityRecordId(run.id),
  employee: toEntityRecordId(result.employeeId),
  pay_profile_id: toEntityRecordId(result.payProfileId) ?? null,
  pay_type: result.payType ?? null,
  paid_days: result.paidDays,
  unpaid_leave_days: result.unpaidLeaveDays,
  expected_work_days: result.expectedWorkDays ?? null,
  is_overridden: false,
  overridden_by: null,
  overridden_at: null,
  override_note: null,
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

const snapshotPayloadFromOverride = (
  run: PayrollRun,
  snapshot: PayrollSnapshot
) => ({
  payroll_run: toEntityRecordId(run.id),
  employee: toEntityRecordId(snapshotEmployeeId(snapshot)),
  pay_profile_id: snapshot.pay_profile_id
    ? toEntityRecordId(
        typeof snapshot.pay_profile_id === 'object'
          ? snapshot.pay_profile_id.id
          : String(snapshot.pay_profile_id)
      )
    : null,
  pay_type: snapshot.pay_type ?? null,
  paid_days: snapshot.paid_days ?? 0,
  unpaid_leave_days: snapshot.unpaid_leave_days ?? 0,
  expected_work_days: snapshot.expected_work_days ?? null,
  is_overridden: true,
  overridden_by: snapshot.overridden_by
    ? toEntityRecordId(
        typeof snapshot.overridden_by === 'object'
          ? snapshot.overridden_by.id
          : String(snapshot.overridden_by)
      )
    : null,
  overridden_at: snapshot.overridden_at ?? nowSurrealDateTime(),
  override_note: snapshot.override_note ?? null,
  regular_hours: snapshot.regular_hours ?? 0,
  overtime_hours: snapshot.overtime_hours ?? 0,
  double_time_hours: snapshot.double_time_hours ?? 0,
  night_premium_hours: snapshot.night_premium_hours ?? 0,
  weekend_premium_hours: snapshot.weekend_premium_hours ?? 0,
  holiday_premium_hours: snapshot.holiday_premium_hours ?? 0,
  regular_pay: snapshot.regular_pay ?? 0,
  overtime_pay: snapshot.overtime_pay ?? 0,
  premium_pay: snapshot.premium_pay ?? 0,
  bonuses: snapshot.bonuses ?? 0,
  deductions: snapshot.deductions ?? 0,
  adjustments: snapshot.adjustments ?? 0,
  tips: snapshot.tips ?? 0,
  gross_pay: snapshot.gross_pay ?? 0,
  net_pay: snapshot.net_pay ?? 0,
  rule_applications: snapshot.rule_applications ?? [],
  calculated_at: snapshot.calculated_at ?? nowSurrealDateTime(),
  calculation_version: snapshot.calculation_version ?? '1.1.0',
})

export const createSnapshots = async (
  db: DbClient,
  run: PayrollRun,
  results: LaborCalculationResult[]
): Promise<PayrollSnapshot[]> => {
  const created: PayrollSnapshot[] = []

  for (const result of results) {
    const inserted = await db.create(
      Tables.payroll_snapshots,
      snapshotPayloadFromResult(run, result)
    )
    created.push(unwrapRecord<PayrollSnapshot>(inserted))
  }

  return created
}

export const loadRunSnapshots = async (
  db: DbClient,
  runId: string
): Promise<PayrollSnapshot[]> => {
  const result = await db.query<[PayrollSnapshot[]]>(
    `SELECT * FROM ${Tables.payroll_snapshots}
     WHERE payroll_run = $runId
     FETCH employee, overridden_by`,
    { runId: toRecordId(runId) }
  )
  return result?.[0] ?? []
}

export const replaceRunSnapshots = async (
  db: DbClient,
  run: PayrollRun,
  results: LaborCalculationResult[],
  preserved: PayrollSnapshot[] = []
): Promise<PayrollSnapshot[]> => {
  await db.query(
    `DELETE ${Tables.payroll_snapshots} WHERE payroll_run = $runId`,
    { runId: toRecordId(run.id) }
  )

  const preservedIds = new Set(preserved.map(snapshotEmployeeId))
  const created = await createSnapshots(
    db,
    run,
    results.filter(result => !preservedIds.has(String(result.employeeId)))
  )

  const restored: PayrollSnapshot[] = []
  for (const snapshot of preserved) {
    const inserted = await db.create(
      Tables.payroll_snapshots,
      snapshotPayloadFromOverride(run, snapshot)
    )
    restored.push(unwrapRecord<PayrollSnapshot>(inserted))
  }

  return [...created, ...restored]
}

export interface UpdateSnapshotOverrideParams {
  snapshotId: string
  paidDays?: number
  regularPay?: number
  overtimePay?: number
  deductions?: number
  overrideNote?: string
  overriddenBy: User
}

export const updateSnapshotOverride = async (
  db: DbClient,
  params: UpdateSnapshotOverrideParams
): Promise<PayrollSnapshot> => {
  const [rows] = await db.query<[PayrollSnapshot[]]>(
    `SELECT * FROM ${Tables.payroll_snapshots} WHERE id = $id LIMIT 1 FETCH payroll_run`,
    { id: toRecordId(params.snapshotId) }
  )
  const current = Array.isArray(rows) ? rows[0] : rows
  if (!current) throw new Error('Payroll snapshot not found')

  const run =
    current.payroll_run && typeof current.payroll_run === 'object'
      ? current.payroll_run
      : undefined
  if (run?.status && run.status !== 'preview') {
    throw new Error('Only preview snapshots can be overridden')
  }

  const regularPay = roundMoney(
    params.regularPay ?? safeNumber(current.regular_pay)
  )
  const overtimePay = roundMoney(
    params.overtimePay ?? safeNumber(current.overtime_pay)
  )
  const deductions = roundMoney(
    params.deductions ?? safeNumber(current.deductions)
  )
  const grossPay = roundMoney(
    regularPay +
      overtimePay +
      safeNumber(current.premium_pay) +
      safeNumber(current.bonuses) +
      safeNumber(current.adjustments)
  )
  const netPay = roundMoney(Math.max(0, grossPay - deductions))

  const merged = await db.merge(params.snapshotId, {
    paid_days:
      params.paidDays === undefined
        ? current.paid_days
        : safeNumber(params.paidDays),
    regular_pay: regularPay,
    overtime_pay: overtimePay,
    deductions,
    gross_pay: grossPay,
    net_pay: netPay,
    is_overridden: true,
    overridden_by: toUserRecordId(params.overriddenBy),
    overridden_at: nowSurrealDateTime(),
    override_note: params.overrideNote?.trim() || current.override_note || null,
  })

  return unwrapRecord<PayrollSnapshot>(merged)
}
