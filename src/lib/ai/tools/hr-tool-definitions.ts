import type {OpenAIToolDefinition} from "@/lib/openai.service.ts";

const dateParams = {
  phrase: {type: "string"},
  startDate: {type: "string"},
  endDate: {type: "string"},
};

const searchLimitProps = {
  search: {type: "string"},
  limit: {type: "number", default: 50},
};

export const AI_HR_READ_TOOLS: OpenAIToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "list_employees",
      description:
        "List HR employees from the Employees module (employee_number, department, position). "
        + "NOT POS system users — use list_users only for login accounts.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "get_employee_detail",
      description:
        "Get a full HR employee dossier by employee_number (e.g. 00001) or employee id (employee:…). "
        + "Always includes linked pay profile, schedule, attendance/time entries, leave balances/requests, "
        + "payroll snapshots, adjustments, documents, performance notes, and assignment history — not just the header. "
        + "Use for any employee# / employee profile / details question — NOT list_users.",
      parameters: {
        type: "object",
        properties: {
          employee_number: {type: "string", description: "HR employee number, e.g. 00001"},
          employee_id: {type: "string", description: "Surreal record id employee:…"},
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_departments",
      description: "List HR departments.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_positions",
      description: "List HR job positions.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_cost_centers",
      description: "List HR cost centers.",
      parameters: {type: "object", properties: searchLimitProps},
    },
  },
  {
    type: "function",
    function: {
      name: "list_hr_leave_requests",
      description:
        "List HR leave requests. Filter by employee_number, date range, or status (pending/approved/rejected).",
      parameters: {
        type: "object",
        properties: {
          ...dateParams,
          employee_number: {type: "string"},
          employee_id: {type: "string"},
          status: {type: "string"},
          limit: {type: "number", default: 50},
        },
      },
    },
  },
];
