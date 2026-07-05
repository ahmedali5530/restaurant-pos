import { Tables } from '@/api/db/tables.ts'
import type { Employee } from '@/api/model/employee.ts'
import type { EmployeePayProfile } from '@/api/model/employee_pay_profile.ts'
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
import { emitLaborCostEvent } from '@/lib/labor-engine/events/labor-cost.events.ts'
import { logLaborChange } from '@/lib/labor-engine/audit/labor-audit.service.ts'
import { toEntityRecordId, toUserRecordId } from '@/lib/labor-engine/record-id.ts'
import { nowSurrealDateTime, toSurrealDateTime } from '@/lib/datetime.ts'

const unwrapRecord = <T>(result: unknown): T => {
  return (Array.isArray(result) ? result[0] : result) as T
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
  const result = await db.query<[PayrollPeriod[]]>(
    `SELECT * FROM ${Tables.payroll_periods} WHERE id = $id LIMIT 1`,
    { id: periodId }
  )
  const period = result?.[0]?.[0]
  if (!period) throw new Error('Payroll period not found')
  return period
}

const loadActiveEmployees = async (db: DbClient): Promise<Employee[]> => {
  const result = await db.query<[Employee[]]>(
    `SELECT * FROM ${Tables.employees}
     WHERE deleted_at = none AND employment_status = 'active'`
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

const computeRunResults = async (
  db: DbClient,
  period: PayrollPeriod
): Promise<LaborCalculationResult[]> => {
  const employees = await loadActiveEmployees(db)
  const profiles = await loadPayProfiles(db)
  const rules = await loadPayRules(db)
  const holidays = await loadHolidays(db, period)
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
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id FETCH payroll_period LIMIT 1`,
    { id: params.runId }
  )
  const run = runResult?.[0]?.[0]
  if (!run) throw new Error('Payroll run not found')
  if (run.status === 'locked' || run.status === 'approved') {
    throw new Error('Cannot recalculate a locked or approved run')
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
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id FETCH payroll_period LIMIT 1`,
    { id: params.runId }
  )
  const before = existing?.[0]?.[0]

  const merged = await db.merge(params.runId, {
    status: 'locked',
  })

  const run = unwrapRecord<PayrollRun>(merged)
  const period = before?.payroll_period

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
  employeeId: string
  grossPay: number
  netPay: number
  regularHours: number
  overtimeHours: number
}

export const exportRun = async (
  db: DbClient,
  params: ExportRunParams
): Promise<{ run: PayrollRun; rows: PayrollExportRow[] }> => {
  const runResult = await db.query<[PayrollRun[]]>(
    `SELECT * FROM ${Tables.payroll_runs} WHERE id = $id LIMIT 1`,
    { id: params.runId }
  )
  const before = runResult?.[0]?.[0]
  if (!before) throw new Error('Payroll run not found')

  const snapshots = await db.query<
    [{
      employee: { id: string }
      gross_pay: number
      net_pay: number
      regular_hours: number
      overtime_hours: number
    }[]]
  >(
    `SELECT employee, gross_pay, net_pay, regular_hours, overtime_hours
     FROM ${Tables.payroll_snapshots}
     WHERE payroll_run = $runId
     FETCH employee`,
    { runId: params.runId }
  )

  const rows: PayrollExportRow[] = (snapshots?.[0] ?? []).map(s => ({
    employeeId:
      typeof s.employee === 'object' ? s.employee.id : String(s.employee),
    grossPay: s.gross_pay ?? 0,
    netPay: s.net_pay ?? 0,
    regularHours: s.regular_hours ?? 0,
    overtimeHours: s.overtime_hours ?? 0,
  }))

  const merged = await db.merge(params.runId, {
    status: 'exported',
  })

  const run = unwrapRecord<PayrollRun>(merged)

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
