/** Maps HR read tools to hr tab permission modules. */
export const HR_TOOL_PERMISSION_MODULES: Record<string, string> = {
  list_employees: "hr.employees",
  get_employee_detail: "hr.employees",
  list_departments: "hr.departments",
  list_positions: "hr.positions",
  list_cost_centers: "hr.cost_centers",
  list_hr_leave_requests: "hr.leave",
};

export const ALL_HR_READ_TOOL_NAMES = Object.keys(HR_TOOL_PERMISSION_MODULES);
