import { Tables } from '@/api/db/tables.ts'
import type { Employee } from '@/api/model/employee.ts'
import type { EmployeePayProfile } from '@/api/model/employee_pay_profile.ts'
import type { LaborAdjustment } from '@/api/model/labor_adjustment.ts'
import type { LaborAdjustmentType } from '@/api/model/hr.types.ts'
import type { LaborPayRule } from '@/api/model/labor_pay_rule.ts'
import type { PayrollPeriod } from '@/api/model/payroll_period.ts'
import type { PayrollRun } from '@/api/model/payroll_run.ts'
import type { PublicHoliday } from '@/api/model/public_holiday.ts'
import type { TimeEntry } from '@/api/model/time_entry.ts'
import type { User } from '@/api/model/user.ts'
import type { DbClient, LaborCalculationResult } from '@/lib/labor-engine/types.ts'
import { calculateEmployeeLabor } from '@/lib/labor-engine/calculator.ts'
import { resolveEffectivePayProfile } from '@/lib/labor-engine/pay-profile.resolver.ts'
import { createSnapshots } from '@/lib/labor-engine/payroll/snapshot.service.ts'
import { closePeriod, lockPeriod } from '@/lib/labor-engine/payroll/period.service.ts'
import { emitLaborCostEvent } from '@/lib/labor-engine/events/labor-cost.events.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime } from '@/lib/datetime.ts'
import { safeNumber } from '@/lib/utils.ts'

const DEDUCTION_ADJUSTMENT_TYPES = new Set<LaborAdjustmentType>([
  'penalty',
  'advance',
  'loan',
  'deduction',
])

const normalizeAdjustmentForPayroll = (adjustment: LaborAdjustment): LaborAdjustment => {
  if (!DEDUCTION_ADJUSTMENT_TYPES.has(adjustment.type)) {
    return adjustment
  }
  return {
    ...adjustment,
    amount: -Math.abs(safeNumber(adjustment.amount)),
  }
}

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
}

const periodIdFromRun = (run: PayrollRun): string | undefined => {
  const period = run.payroll_period
  if (!period) return undefined
  if (typeof period === 'object' && period.id) return String(period.id)
  return String(period)
}

const periodStatusFromRun = (run: PayrollRun): string | undefined => {
  const period = run.payroll_period
  if (period && typeof period === 'object') return period.status
  return undefined
}

export interface GeneratePreviewParams {
  payrollPeriodId: string
  generatedBy: User
  runNumber?: number
}

export interface RecalculateRunParams {
  runId: string
  recalculatedBy?: User
}

export interface LockRunParams {
  runId: string
  lockedBy: User
}

export interface ApproveRunParams {
  runId: string
  approvedBy: User
}

export interface ExportRunParams {
  runId: string
  exportedBy?: User
}

const loadPeriod = async (db: DbClient, periodId: string): Promise<PayrollPeriod> => {
  const [result] = await db.query<[PayrollPeriod]>(
    `SELECT * FROM ONLY $id`,
    { id: periodId }
  )
  const period = result
  if (!period) throw new Error('Payroll period not found')
  return period
}

const loadActiveEmployees = async (db: DbClient): Promise<Employee[]> => {
  const result = await db.query<[Employee[]]>(
    `SELECT * FROM ${Tables.employees}
     WHERE deleted_at = none AND employment_status = 'active'
     FETCH department, position, cost_center`
  )
  return result?.[0] ?? []
}

const loadPayProfiles = async (db: DbClient): Promise<EmployeePayProfile[]> => {
  const result = await db.query<[EmployeePayProfile[]]>(
    `SELECT * FROM ${Tables.employee_pay_profiles}
     FETCH employee, overtime_policy, holiday_policy, night_policy, weekend_policy`
  )
  return result?.[0] ?? []
}

const loadPayRules = async (db: DbClient): Promise<LaborPayRule[]> => {
  const result = await db.query<[LaborPayRule[]]>(
    `SELECT * FROM ${Tables.labor_pay_rules}
     WHERE deleted_at = none AND is_active != false
     ORDER BY priority ASC`
  )
  return result?.[0] ?? []
}

const loadHolidays = async (
  db: DbClient,
  period: PayrollPeriod
): Promise<PublicHoliday[]> => {
  const result = await db.query<[PublicHoliday[]]>(
    `SELECT * FROM ${Tables.public_holidays}
     WHERE deleted_at = none AND is_active != false
       AND date >= $start AND date <= $end`,
    {
      start: period.start_date,
      end: period.end_date,
    }
  )
  return result?.[0] ?? []
}

const loadTimeEntriesForEmployee = async (
  db: DbClient,
  employeeId: string,
  period: PayrollPeriod
): Promise<TimeEntry[]> => {
  const result = await db.query<[TimeEntry[]]>(
    `SELECT * FROM ${Tables.time_entries}
     WHERE employee = $employeeId
       AND approval_status = 'approved'
       AND clock_in >= $start AND clock_in <= $end
     FETCH breaks`,
    {
      employeeId,
      start: period.start_date,
      end: period.end_date,
    }
  )
  return result?.[0] ?? []
}

const loadApprovedAdjustments = async (
  db: DbClient,
  period: PayrollPeriod
): Promise<LaborAdjustment[]> => {
  const result = await db.query<[LaborAdjustment[]]>(
    `SELECT * FROM ${Tables.labor_adjustments}
     WHERE status = 'approved'
       AND (
         payroll_period = $periodId
         OR (
           payroll_period = none
           AND effective_date >= $start
           AND effective_date <= $end
         )
       )`,
    {
      periodId: period.id,
      start: period.start_date,
      end: period.end_date,
    }
  )
  return (result?.[0] ?? []).map(normalizeAdjustmentForPayroll)
}

const adjustmentsForEmployee = (
  adjustments: LaborAdjustment[],
  employeeId: string
): LaborAdjustment[] =>
  adjustments.filter(adjustment => {
    const id =
      typeof adjustment.employee === 'object'
        ? adjustment.employee.id
        : String(adjustment.employee)
    return id === employeeId
  })

const computeRunResults = async (
  db: DbClient,
  period: PayrollPeriod
): Promise<LaborCalculationResult[]> => {
  const employees = await loadActiveEmployees(db)
  const profiles = await loadPayProfiles(db)
  const rules = await loadPayRules(db)
  const holidays = await loadHolidays(db, period)
  const adjustments = await loadApprovedAdjustments(db, period)
  const results: LaborCalculationResult[] = []

  for (const employee of employees) {
    const payProfile = resolveEffectivePayProfile(
      employee,
      period.end_date,
      profiles
    )
    if (!payProfile) continue

    const timeEntries = await loadTimeEntriesForEmployee(db, employee.id, period)

    results.push(
      calculateEmployeeLabor({
        employee,
        payProfile,
        timeEntries,
        rules,
        holidays,
        periodStart: period.start_date,
        periodEnd: period.end_date,
        adjustments: adjustmentsForEmployee(adjustments, employee.id),
      })
    )
  }

  return results
}

export const generatePreview = async (
  db: DbClient,
  params: GeneratePreviewParams
): Promise<{ run: PayrollRun; results: LaborCalculationResult[] }> => {
  const period = await loadPeriod(db, params.payrollPeriodId)
  if (period.status !== 'open') {
    throw new Error('Payroll period must be open to generate a run')
  }
  const results = await computeRunResults(db, period)

  const inserted = await db.create(Tables.payroll_runs, {
    payroll_period: toEntityRecordId(params.payrollPeriodId),
    run_number: params.runNumber ?? 1,
    status: 'preview',
    generated_at: nowSurrealDateTime(),
    generated_by: toUserRecordId(params.generatedBy),
  })

  const run = unwrapRecord<PayrollRun>(inserted)
  await createSnapshots(db, run, results)

  await logLaborChange(db, {
    entityType: 'payroll_run',
    entityId: run.id,
    action: 'generate_preview',
    after: run,
    changedBy: params.generatedBy,
  })

  return { run, results }
}

export const recalculateRun = async (
  db: DbClient,
  params: RecalculateRunParams
): Promise<{ run: PayrollRun; results: LaborCalculationResult[] }> => {
  const runResult = await db.query<[PayrollRun[]]>(
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id LIMIT 1 FETCH payroll_period `,
    { id: params.runId }
  )
  const run = runResult?.[0]?.[0]
  if (!run) throw new Error('Payroll run not found')
  if (run.status === 'locked' || run.status === 'approved' || run.status === 'exported') {
    throw new Error('Cannot recalculate a locked, approved, or exported run')
  }

  const period =
    typeof run.payroll_period === 'object'
      ? run.payroll_period
      : await loadPeriod(db, String(run.payroll_period))

  const results = await computeRunResults(db, period)

  await db.query(
    `DELETE ${Tables.payroll_snapshots} WHERE payroll_run = $runId`,
    { runId: params.runId }
  )

  await createSnapshots(db, run, results)

  const merged = await db.merge(params.runId, {
    generated_at: nowSurrealDateTime(),
    status: 'preview',
  })

  const updatedRun = unwrapRecord<PayrollRun>(merged)

  await logLaborChange(db, {
    entityType: 'payroll_run',
    entityId: updatedRun.id,
    action: 'recalculate_run',
    after: updatedRun,
    changedBy: params.recalculatedBy,
  })

  return { run: updatedRun, results }
}

export const lockRun = async (
  db: DbClient,
  params: LockRunParams
): Promise<PayrollRun> => {
  const existing = await db.query<[PayrollRun[]]>(
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id LIMIT 1 FETCH payroll_period`,
    { id: params.runId }
  )
  const before = existing?.[0]?.[0]
  if (!before) throw new Error('Payroll run not found')
  if (before.status !== 'preview') {
    throw new Error('Only preview runs can be locked')
  }

  const merged = await db.merge(params.runId, {
    status: 'locked',
  })

  const run = unwrapRecord<PayrollRun>(merged)
  const period = before?.payroll_period
  const periodId = periodIdFromRun(before)

  if (periodId) {
    let status = periodStatusFromRun(before)
    if (status === undefined) {
      status = (await loadPeriod(db, periodId)).status
    }
    if (status === 'open') {
      await lockPeriod(db, {periodId, lockedBy: params.lockedBy})
    }
  }

  await emitLaborCostEvent(db, {
    eventType: 'payroll_locked',
    payrollRunId: run.id,
    periodStart: typeof period === 'object' ? period.start_date : undefined,
    periodEnd: typeof period === 'object' ? period.end_date : undefined,
    payload: { runId: run.id },
  })

  await logLaborChange(db, {
    entityType: 'payroll_run',
    entityId: run.id,
    action: 'lock_run',
    before,
    after: run,
    changedBy: params.lockedBy,
  })

  return run
}

export const approveRun = async (
  db: DbClient,
  params: ApproveRunParams
): Promise<PayrollRun> => {
  const existing = await db.query<[PayrollRun[]]>(
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id LIMIT 1`,
    { id: params.runId }
  )
  const before = existing?.[0]?.[0]
  if (!before) throw new Error('Payroll run not found')
  if (before.status !== 'locked') {
    throw new Error('Only locked runs can be approved')
  }

  const merged = await db.merge(params.runId, {
    status: 'approved',
    approved_at: nowSurrealDateTime(),
    approved_by: toUserRecordId(params.approvedBy),
  })

  const run = unwrapRecord<PayrollRun>(merged)

  await logLaborChange(db, {
    entityType: 'payroll_run',
    entityId: run.id,
    action: 'approve_run',
    before,
    after: run,
    changedBy: params.approvedBy,
  })

  return run
}

export interface PayrollExportRow {
  employeeNumber: string
  employeeName: string
  regularHours: number
  overtimeHours: number
  grossPay: number
  deductions: number
  adjustments: number
  netPay: number
}

export const exportRun = async (
  db: DbClient,
  params: ExportRunParams
): Promise<{ run: PayrollRun; rows: PayrollExportRow[] }> => {
  const runResult = await db.query<[PayrollRun[]]>(
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id LIMIT 1 FETCH payroll_period`,
    { id: params.runId }
  )
  const before = runResult?.[0]?.[0]
  if (!before) throw new Error('Payroll run not found')
  if (before.status !== 'approved') {
    throw new Error('Only approved runs can be exported')
  }

  const snapshots = await db.query<
    [{
      employee: {
        id: string
        employee_number?: string
        first_name?: string
        last_name?: string
      }
      gross_pay: number
      net_pay: number
      deductions: number
      adjustments: number
      regular_hours: number
      overtime_hours: number
    }[]]
  >(
    `SELECT employee, gross_pay, net_pay, deductions, adjustments, regular_hours, overtime_hours
     FROM ${Tables.payroll_snapshots}
     WHERE payroll_run = $runId
     FETCH employee`,
    { runId: params.runId }
  )

  const rows: PayrollExportRow[] = (snapshots?.[0] ?? []).map(s => {
    const employee = typeof s.employee === 'object' ? s.employee : null
    return {
      employeeNumber: employee?.employee_number ?? '',
      employeeName: employee
        ? `${employee.first_name ?? ''} ${employee.last_name ?? ''}`.trim()
        : String(s.employee ?? ''),
      regularHours: s.regular_hours ?? 0,
      overtimeHours: s.overtime_hours ?? 0,
      grossPay: s.gross_pay ?? 0,
      deductions: s.deductions ?? 0,
      adjustments: s.adjustments ?? 0,
      netPay: s.net_pay ?? 0,
    }
  })

  const merged = await db.merge(params.runId, {
    status: 'exported',
  })

  const run = unwrapRecord<PayrollRun>(merged)

  const periodId = periodIdFromRun(before)
  if (periodId) {
    let status = periodStatusFromRun(before)
    if (status === undefined) {
      status = (await loadPeriod(db, periodId)).status
    }
    if (status !== 'closed' && status !== 'paid') {
      await closePeriod(db, {periodId, closedBy: params.exportedBy})
    }
  }

  await logLaborChange(db, {
    entityType: 'payroll_run',
    entityId: run.id,
    action: 'export_run',
    before,
    after: run,
    changedBy: params.exportedBy,
  })

  return { run, rows }
}
