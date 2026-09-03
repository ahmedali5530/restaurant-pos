-- Default labor policies and leave types (seed data — run once on fresh DB)

INSERT INTO labor_policy {
  code: 'OT_STANDARD',
  name: 'Standard Overtime',
  policy_type: 'overtime',
  config: { threshold_hours: 8, multiplier: 1.5 },
  is_active: true
};

INSERT INTO labor_policy {
  code: 'OT_DOUBLE',
  name: 'Double Time',
  policy_type: 'overtime',
  config: { threshold_hours: 12, multiplier: 2 },
  is_active: true
};

INSERT INTO labor_policy {
  code: 'NIGHT_PREMIUM',
  name: 'Night Shift Premium',
  policy_type: 'night',
  config: { start_time: '22:00', end_time: '06:00', multiplier: 1.25 },
  is_active: true
};

INSERT INTO labor_policy {
  code: 'WEEKEND_PREMIUM',
  name: 'Weekend Premium',
  policy_type: 'weekend',
  config: { days_of_week: [0, 6], multiplier: 1.5 },
  is_active: true
};

INSERT INTO labor_policy {
  code: 'HOLIDAY_PREMIUM',
  name: 'Holiday Premium',
  policy_type: 'holiday',
  config: { multiplier: 2 },
  is_active: true
};

INSERT INTO leave_type {
  code: 'VACATION',
  name: 'Vacation',
  paid: true,
  requires_approval: true,
  max_days_per_year: 20,
  accrual_rate: 1.67,
  is_active: true
};

INSERT INTO leave_type {
  code: 'SICK',
  name: 'Sick Leave',
  paid: true,
  requires_approval: true,
  max_days_per_year: 10,
  is_active: true
};

INSERT INTO leave_type {
  code: 'UNPAID',
  name: 'Unpaid Leave',
  paid: false,
  requires_approval: true,
  is_active: true
};

INSERT INTO leave_type {
  code: 'EMERGENCY',
  name: 'Emergency Leave',
  paid: true,
  requires_approval: true,
  is_active: true
};
