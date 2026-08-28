import {describe, expect, it} from "vitest";
import {createDocumentLineAdapter} from "@/lib/data-import/document-import-adapter.ts";

describe("createDocumentLineAdapter", () => {
  it("appends and updates lines in memory", () => {
    const adapter = createDocumentLineAdapter<{code: string; qty: number}>();
    adapter.append({code: "A", qty: 1});
    adapter.append({code: "B", qty: 2});
    expect(adapter.getLines()).toHaveLength(2);

    adapter.update(1, {code: "B", qty: 5});
    expect(adapter.getLines()[1].qty).toBe(5);
  });

  it("clears all lines", () => {
    const adapter = createDocumentLineAdapter();
    adapter.append({x: 1});
    adapter.clear();
    expect(adapter.getLines()).toHaveLength(0);
  });
});
