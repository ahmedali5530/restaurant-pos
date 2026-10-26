/** Display inventory item as "Name (code)" when a code/number is present. */
export const formatInventoryItemLabel = (
  name?: string | null,
  code?: string | null,
  fallback = "Unknown",
): string => {
  const label = String(name ?? "").trim() || fallback;
  const itemCode = String(code ?? "").trim();
  return itemCode ? `${label} (${itemCode})` : label;
};
