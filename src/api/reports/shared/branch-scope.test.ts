import {describe, expect, it} from "vitest";
import {
  buildBranchLabelMap,
  filterSyncBranchesForUser,
  partitionByBranchId,
  resolveEffectiveBranchIds,
  UNKNOWN_BRANCH_ID,
} from "@/api/reports/shared/branch-scope.ts";
import {buildBranchInsideCondition} from "@/api/reports/shared/query.ts";

describe("resolveEffectiveBranchIds", () => {
  it("skips filtering when not in multi-branch mode", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: ["a"],
        userBranchIds: ["a"],
        multiBranchMode: false,
      }),
    ).toBeUndefined();
  });

  it("returns undefined for unrestricted users with empty selection", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: [],
        userBranchIds: null,
        multiBranchMode: true,
      }),
    ).toBeUndefined();
  });

  it("returns the selection for unrestricted users", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: ["store-b", "store-a"],
        userBranchIds: [],
        multiBranchMode: true,
      }),
    ).toEqual(["store-b", "store-a"]);
  });

  it("forces allowed ids for restricted users with empty selection", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: [],
        userBranchIds: ["store-a", "store-c"],
        multiBranchMode: true,
      }),
    ).toEqual(["store-a", "store-c"]);
  });

  it("intersects selection with allowed ids for restricted users", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: ["store-a", "store-x"],
        userBranchIds: ["store-a", "store-b"],
        multiBranchMode: true,
      }),
    ).toEqual(["store-a"]);
  });

  it("returns empty when restricted selection has no overlap", () => {
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: ["store-x"],
        userBranchIds: ["store-a"],
        multiBranchMode: true,
      }),
    ).toEqual([]);
  });
});

describe("buildBranchInsideCondition", () => {
  it("omits the condition when branchIds is undefined", () => {
    expect(buildBranchInsideCondition(undefined)).toEqual({params: {}});
  });

  it("marks emptyResult when the allowed set is empty", () => {
    expect(buildBranchInsideCondition([])).toEqual({
      condition: "false",
      params: {},
      emptyResult: true,
    });
  });

  it("builds a string INSIDE condition for branch_id", () => {
    expect(buildBranchInsideCondition(["store-a", "store-b"])).toEqual({
      condition: "branch_id INSIDE $branchIds",
      params: {branchIds: ["store-a", "store-b"]},
    });
  });
});

describe("partitionByBranchId", () => {
  it("groups rows and recomputes section order from branchOrder", () => {
    const labels = buildBranchLabelMap([
      {id: "1", client_id: "store-b", name: "Beta"},
      {id: "2", client_id: "store-a", name: "Alpha"},
    ]);
    const parts = partitionByBranchId(
      [
        {branch_id: "store-b", n: 1},
        {branch_id: "store-a", n: 2},
        {n: 3},
      ],
      labels,
      ["store-a", "store-b"],
    );

    expect(parts.map((p) => p.branchId)).toEqual([
      "store-a",
      "store-b",
      UNKNOWN_BRANCH_ID,
    ]);
    expect(parts[0].label).toBe("Alpha (store-a)");
    expect(parts[0].rows).toHaveLength(1);
    expect(parts[2].rows[0]).toEqual({n: 3});
  });
});

describe("filterSyncBranchesForUser", () => {
  const branches = [
    {id: "1", client_id: "a", name: "A", active: true},
    {id: "2", client_id: "b", name: "B", active: false},
    {id: "3", client_id: "c", name: "C", active: true},
  ];

  it("keeps active branches for unrestricted users", () => {
    expect(filterSyncBranchesForUser(branches, null).map((b) => b.client_id)).toEqual([
      "a",
      "c",
    ]);
  });

  it("intersects with user branch_ids", () => {
    expect(filterSyncBranchesForUser(branches, ["c"]).map((b) => b.client_id)).toEqual([
      "c",
    ]);
  });
});

describe("multiBranchMode gating", () => {
  it("does not apply branch filters when sync_branch exists but mode is off (no stamps)", () => {
    // Catalog-only sync_branch registries must not force branch_id filters.
    expect(
      resolveEffectiveBranchIds({
        selectedBranchIds: ["CLIENT-001", "branch-02"],
        userBranchIds: null,
        multiBranchMode: false,
      }),
    ).toBeUndefined();
  });
});
