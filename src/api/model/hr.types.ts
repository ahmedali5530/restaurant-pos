import {DateTime} from 'surrealdb';

export type EmploymentStatus = 'active' | 'inactive' | 'terminated' | 'on_leave' | 'suspended';
export type EmploymentType = 'hourly' | 'monthly_salary' | 'weekly_salary' | 'daily_wage' | 'contract' | 'commission' | 'mixed';
export type PayType = EmploymentType;
export type LaborPolicyType = 'overtime' | 'holiday' | 'night' | 'weekend' | 'break';
export type AttendanceStatus = 'present' | 'late' | 'early_leave' | 'missed_shift' | 'manual' | 'adjusted';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type TimeEntrySource = 'clock' | 'manual' | 'import' | 'adjustment';
export type BreakType = 'paid' | 'unpaid';
export type ScheduleStatus = 'draft' | 'published' | 'archived';
export type ScheduledShiftStatus = 'scheduled' | 'confirmed' | 'cancelled' | 'no_show';
export type SwapRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';
export type PayrollPeriodType = 'weekly' | 'biweekly' | 'monthly' | 'custom';
export type PayrollPeriodStatus = 'open' | 'locked' | 'closed' | 'paid';
export type PayrollRunStatus = 'draft' | 'preview' | 'locked' | 'approved' | 'exported';
export type LaborAdjustmentType = 'bonus' | 'penalty' | 'allowance' | 'reimbursement' | 'advance' | 'loan' | 'correction';
export type DocumentCategory = 'contract' | 'certificate' | 'license' | 'id_document' | 'medical' | 'warning' | 'other';
export type PerformanceNoteType = 'warning' | 'compliment' | 'review' | 'incident';
export type PerformanceNoteSeverity = 'low' | 'medium' | 'high' | 'critical';
export type LaborCostEventType = 'payroll_locked' | 'daily_cost_computed' | 'adjustment_posted';
export type RuleEffectType = 'multiplier' | 'fixed_bonus' | 'fixed_deduction' | 'percent_bonus' | 'percent_deduction';
export type RuleAppliesTo = 'regular' | 'overtime' | 'all_hours';
export type StackingMode = 'allow' | 'prevent' | 'highest_wins' | 'priority';

export interface EmergencyContact {
  name?: string;
  phone?: string;
  relationship?: string;
}

export interface BreakRule {
  min_shift_hours: number;
  break_minutes: number;
  paid: boolean;
}

export interface LaborPolicyConfig {
  threshold_hours?: number;
  multiplier?: number;
  start_time?: string;
  end_time?: string;
  days_of_week?: number[];
}

export interface LaborPayRuleConditions {
  after_hours_day?: number;
  after_hours_week?: number;
  days_of_week?: number[];
  months?: number[];
  start_date?: string;
  end_date?: string;
  start_time?: string;
  end_time?: string;
  holiday_ids?: string[];
  department_ids?: string[];
  position_ids?: string[];
  employee_ids?: string[];
  cost_center_ids?: string[];
}

export interface LaborPayRuleEffect {
  type: RuleEffectType;
  value: number;
  applies_to?: RuleAppliesTo;
}

export interface RecurrenceRule {
  month?: number;
  day?: number;
}

export interface WithTimestamps {
  created_at?: DateTime;
  deleted_at?: DateTime;
}
