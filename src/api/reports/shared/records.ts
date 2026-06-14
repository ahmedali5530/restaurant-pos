export const recordToString = (value: unknown): string => {
  if (!value) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "object" && value !== null && "id" in value) {
    const id = (value as {id: unknown}).id;
    return typeof id === "string" ? id : String(id);
  }
  return String(value);
};
