export type AiExamplePromptCategory = "sales" | "inventory" | "analysis" | "charts";

export interface AiExamplePrompt {
  category: AiExamplePromptCategory;
  prompt: string;
}

export const AI_EXAMPLE_PROMPTS: AiExamplePrompt[] = [
  {category: "sales", prompt: "Top 10 dishes by revenue this week"},
  {category: "sales", prompt: "Sales summary for yesterday with day-part breakdown"},
  {category: "sales", prompt: "Product mix by category this month — lowest profit items"},
  {category: "sales", prompt: "Who were the top 5 servers by net sales last month?"},
  {category: "sales", prompt: "Which products haven't sold in 60 days?"},
  {category: "inventory", prompt: "Which inventory items are below reorder level?"},
  {category: "inventory", prompt: "Summarize waste by item for last week"},
  {category: "charts", prompt: "Line chart of daily net sales for the last 30 days"},
  {category: "charts", prompt: "Forecast net sales for the next 7 days"},
  {category: "analysis", prompt: "Compare net sales this week vs last week"},
  {category: "analysis", prompt: "Give me a quick business health overview"},
  {category: "analysis", prompt: "Show me orders with in progress status"},
];
