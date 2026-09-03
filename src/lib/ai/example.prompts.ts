export type AiExamplePromptCategory =
  | "sales"
  | "inventory"
  | "operations"
  | "labor"
  | "accounts"
  | "charts"
  | "analysis";

export type AiExamplePromptFilter = "all" | AiExamplePromptCategory;

export const AI_EXAMPLE_PROMPT_CATEGORIES: AiExamplePromptCategory[] = [
  "sales",
  "inventory",
  "operations",
  "labor",
  "accounts",
  "charts",
  "analysis",
];

export interface AiExamplePrompt {
  category: AiExamplePromptCategory;
  prompt: string;
}

export const AI_EXAMPLE_PROMPTS: AiExamplePrompt[] = [
  // Sales
  {category: "sales", prompt: "Top 10 dishes by revenue this week"},
  {category: "sales", prompt: "Sales summary for yesterday with day-part breakdown"},
  {category: "sales", prompt: "Product mix by category this month — lowest profit items"},
  {category: "sales", prompt: "Who were the top 5 servers by net sales last month?"},
  {category: "sales", prompt: "Which products haven't sold in 60 days?"},
  {category: "sales", prompt: "Sales summary for every order taker during their current session"},
  {category: "sales", prompt: "How much tips were collected today and how would they be distributed?"},
  {category: "sales", prompt: "Summarize promotional discounts applied today over 20% of the bill"},
  {category: "sales", prompt: "Menu engineering matrix for this month — show Plowhorses and Puzzles"},
  {category: "sales", prompt: "High-profit dishes with month over month volume drop"},
  {category: "sales", prompt: "What is the 5% price adjustment impact on our top 3 items?"},
  {category: "sales", prompt: "Tax summary for this month"},
  {category: "sales", prompt: "Coupon usage summary this month"},
  {category: "sales", prompt: "Weekly sales breakdown by day part"},
  {category: "sales", prompt: "Hourly product sales for peak hours today"},
  {category: "sales", prompt: "Voids by reason this week"},

  // Inventory
  {category: "inventory", prompt: "How much inventory do I need this Friday and what should I buy?"},
  {category: "inventory", prompt: "Forecast inventory needed for the next 7 days — cricket final on Saturday, expect 30% busier"},
  {category: "inventory", prompt: "Which inventory items are below reorder level?"},
  {category: "inventory", prompt: "Summarize waste by item for last week"},
  {category: "inventory", prompt: "Consumption summary for last month"},
  {category: "inventory", prompt: "Sale vs consumption variance this month"},
  {category: "inventory", prompt: "Kitchen reconciliation report for last week"},
  {category: "inventory", prompt: "Inventory purchase movements this week"},
  {category: "inventory", prompt: "Open purchase orders awaiting approval"},
  {category: "inventory", prompt: "Show inventory adjustments this month"},
  {category: "inventory", prompt: "Which items are below reorder after recent adjustments?"},

  // Operations
  {category: "operations", prompt: "Who are my top 3 fastest and slowest servers by ticket time this week?"},
  {category: "operations", prompt: "Which server has the lowest turnaround and highest average check?"},
  {category: "operations", prompt: "Flag order takers with void or discount rates above team average this week"},
  {category: "operations", prompt: "Average ticket time for delivery vs dine-in this week"},
  {category: "operations", prompt: "Which kitchen stations are slowest between 7 PM and 9 PM?"},
  {category: "operations", prompt: "Show cash orders modified or removed before close"},
  {category: "operations", prompt: "Cancel and comp reasons summary for last month"},
  {category: "operations", prompt: "Show me orders with in progress status"},
  {category: "operations", prompt: "Get everything for order id order:pkzurx2a73wxstql09bv including items, voids, discounts, taxes, and tracking"},
  {category: "operations", prompt: "Show delivery orders in progress"},
  {category: "operations", prompt: "Expense summary from closings this week"},
  {category: "operations", prompt: "Activity log audit for today"},
  {category: "operations", prompt: "Show suspicious cash register activity this week"},
  {category: "operations", prompt: "Investigate potential fraud — voids, discounts, and tracking records"},
  {category: "operations", prompt: "Cash closing summary for yesterday"},

  // Labor
  {category: "labor", prompt: "How many staff do I need this Friday?"},
  {category: "labor", prompt: "Labor cost percentage vs sales by hour for last Friday"},
  {category: "labor", prompt: "Labor cost as a percentage of net sales this week"},
  {category: "labor", prompt: "Overtime report for last month"},
  {category: "labor", prompt: "Who is clocked in right now?"},
  {category: "labor", prompt: "Scheduled vs actual labor hours this week"},
  {category: "labor", prompt: "Payroll summary for this month"},
  {category: "labor", prompt: "Labor cost trend for the last 30 days"},

  // Accounts
  {category: "accounts", prompt: "Trial balance as of today — do debits equal credits?"},
  {category: "accounts", prompt: "Do trial balance debits equal credits as of yesterday?"},
  {category: "accounts", prompt: "Profit and loss for this month"},
  {category: "accounts", prompt: "Balance sheet as of month-end"},
  {category: "accounts", prompt: "Cash flow this month by operating vs investing"},
  {category: "accounts", prompt: "General ledger for account 1010 in March"},
  {category: "accounts", prompt: "Posted journal entries from source module purchase this week"},
  {category: "accounts", prompt: "Customer statement for account 1200 this month"},
  {category: "accounts", prompt: "Supplier statement for account 2100 this month"},
  {category: "accounts", prompt: "List chart of accounts for customer accounts"},

  // Charts
  {category: "charts", prompt: "Line chart of daily net sales for the last 30 days"},
  {category: "charts", prompt: "Forecast net sales for the next 7 days"},
  {category: "charts", prompt: "Bar chart of top 10 dishes by revenue this week"},
  {category: "charts", prompt: "Forecast inventory consumption for the next 14 days"},

  // Analysis
  {category: "analysis", prompt: "Compare net sales this week vs last week"},
  {category: "analysis", prompt: "Give me a quick business health overview"},
  {category: "analysis", prompt: "Compare labor cost this month vs last month"},
  {category: "analysis", prompt: "Daily net sales time series for the last 30 days"},
  {category: "analysis", prompt: "Forecast inventory consumption for next 14 days"},
];

/** Twelve advanced analytics prompts from the implementation plan (for test coverage). */
export const ADVANCED_ANALYTICS_PLAN_PROMPTS = [
  "Labor cost percentage vs sales by hour for last Friday",
  "Who are my top 3 fastest and slowest servers by ticket time this week?",
  "Which server has the lowest turnaround and highest average check?",
  "Flag order takers with void or discount rates above team average this week",
  "Show cash orders modified or removed before close",
  "Summarize promotional discounts applied today over 20% of the bill",
  "Menu engineering matrix for this month — show Plowhorses and Puzzles",
  "High-profit dishes with month over month volume drop",
  "What is the 5% price adjustment impact on our top 3 items?",
  "Average ticket time for delivery vs dine-in this week",
  "Which kitchen stations are slowest between 7 PM and 9 PM?",
  "Cancel and comp reasons summary for last month",
] as const;
