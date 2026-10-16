import "@tanstack/react-table";

declare module "@tanstack/react-table" {
  interface ColumnMeta<TData, TValue> {
    /**
     * SurrealQL expression to search instead of the column's own field —
     * needed when the column id is a record-link field (its value is a
     * record reference, not a string) and the column's cell value is
     * computed from a related record instead.
     */
    filterField?: string;
  }
}
