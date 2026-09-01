import {describe, expect, it, vi} from "vitest";
import {buildWriteProposal} from "@/lib/ai/tools/write-tools.ts";
import type {ImportDbLike} from "@/lib/data-import/types.ts";

const t = (key: string, options?: any) => options?.defaultValue ?? key;

/**
 * `create`/`insert`/`merge` throw if called — proves buildWriteProposal
 * never writes to the database, only `query` (reference lookups) is used.
 */
const makeDb = (categoryRows: Array<{id: string; name: string}> = [{id: "categories:1", name: "Pizza"}]): ImportDbLike => ({
  query: vi.fn(async (sql: string) => {
    if (sql.includes("categories")) return [categoryRows];
    if (sql.includes("taxes")) return [[]];
    return [[]];
  }),
  create: vi.fn(async () => {
    throw new Error("buildWriteProposal must never call db.create");
  }),
  insert: vi.fn(async () => {
    throw new Error("buildWriteProposal must never call db.insert");
  }),
  merge: vi.fn(async () => {
    throw new Error("buildWriteProposal must never call db.merge");
  }),
});

describe("buildWriteProposal", () => {
  it("propose_create_dishes: builds a clean proposal for a valid dish, no db writes", async () => {
    const db = makeDb();
    const proposal = await buildWriteProposal(
      "propose_create_dishes",
      {dishes: [{name: "Margherita", price: 9, categories: ["Pizza"]}]},
      {db, t},
    );

    expect(proposal.mode).toBe("create");
    expect(proposal.configId).toBe("dishes");
    expect(proposal.records).toHaveLength(1);
    expect(proposal.hasBlockingErrors).toBe(false);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.merge).not.toHaveBeenCalled();
  });

  it("propose_create_dishes: flags missing required fields as blocking, still no db writes", async () => {
    const db = makeDb();
    // no price, no categories
    const proposal = await buildWriteProposal(
      "propose_create_dishes",
      {dishes: [{name: "Mystery item"}]},
      {db, t},
    );

    expect(proposal.hasBlockingErrors).toBe(true);
    const issues = proposal.records[0].issues;
    expect(issues.some(i => i.field === "price" && i.severity === "error")).toBe(true);
    expect(issues.some(i => i.field === "categories" && i.severity === "error")).toBe(true);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.merge).not.toHaveBeenCalled();
  });

  it("propose_create_dishes: unknown category is flagged for create, not silently resolved", async () => {
    const db = makeDb([{id: "categories:1", name: "Pizza"}]);
    const proposal = await buildWriteProposal(
      "propose_create_dishes",
      {dishes: [{name: "Sushi Roll", price: 12, categories: ["Sushi"]}]},
      {db, t},
    );

    const categoryValue = proposal.records[0].values.categories;
    expect(categoryValue[0].create).toBe(true);
    expect(categoryValue[0].id).toBeUndefined();
    // Deliberately create:true, not an issue: validateRecord() only re-raises
    // unresolved_reference when a ref is NOT resolved and NOT flagged create
    // (see validate.ts) — a "will be created" ref is a valid, non-blocking
    // state. The preview UI's own signal is the `create` flag itself
    // (rendered as "(new)" — see write-proposal-preview.tsx's formatCell).
    expect(proposal.hasBlockingErrors).toBe(false);
    expect(proposal.records[0].issues.some(i => i.severity === "error")).toBe(false);
  });

  it("propose_update_dishes: builds an update-mode proposal keyed on number", async () => {
    const db = makeDb();
    const proposal = await buildWriteProposal(
      "propose_update_dishes",
      {dishes: [{number: "42", price: 11}]},
      {db, t},
    );

    expect(proposal.mode).toBe("update");
    expect(proposal.records[0].values.number).toBe("42");
    expect(db.create).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
    expect(db.merge).not.toHaveBeenCalled();
  });

  it("propose_update_dishes: missing match field (number) is blocking in the preview, not just at commit", async () => {
    const db = makeDb();
    const proposal = await buildWriteProposal(
      "propose_update_dishes",
      {dishes: [{price: 11}]}, // no `number` — nothing to match against
      {db, t},
    );

    expect(proposal.hasBlockingErrors).toBe(true);
    expect(
      proposal.records[0].issues.some(i => i.field === "number" && i.severity === "error"),
    ).toBe(true);
  });

  it("propose_update_dishes: a partial patch (price only) is NOT blocked by name/categories required checks", async () => {
    // dish.import.config's onImportRow requires name/price/categories for both
    // create AND update — reused as-is, a partial update would incorrectly
    // read as missing-required. The write-tools layer must merge onto the
    // existing dish first so this proposal comes back clean.
    const db: ImportDbLike = {
      query: vi.fn(async (sql: string) => {
        if (sql.includes("FETCH categories, tax")) {
          return [[{
            id: "menu_item:1",
            name: "Existing Dish",
            number: "1",
            priority: 0,
            price: 9,
            cost: 3,
            categories: [{id: "category:1", name: "Pizza"}],
            tax: null,
          }]];
        }
        if (sql.includes("category")) return [[{id: "category:1", name: "Pizza"}]];
        if (sql.includes("tax")) return [[]];
        return [[]];
      }),
      create: vi.fn(async () => { throw new Error("must never write during proposal build"); }),
      insert: vi.fn(async () => { throw new Error("must never write during proposal build"); }),
      merge: vi.fn(async () => { throw new Error("must never write during proposal build"); }),
    };

    const proposal = await buildWriteProposal(
      "propose_update_dishes",
      {dishes: [{number: "1", price: 12.5}]}, // only price supplied
      {db, t},
    );

    expect(proposal.hasBlockingErrors).toBe(false);
    expect(proposal.records[0].values.name).toBe("Existing Dish"); // fell back to existing
    expect(proposal.records[0].values.price).toBe(12.5); // AI's change applied
  });

  it("rejects unknown tool names", async () => {
    const db = makeDb();
    await expect(
      buildWriteProposal("propose_delete_everything", {}, {db, t}),
    ).rejects.toThrow(/Unknown write tool/);
  });
});
