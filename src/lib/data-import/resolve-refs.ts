import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {findBestSmartMatch} from "@/lib/data-import/fuzzy.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportIssue,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";

type Candidate = {
  label: string;
  value: string;
  /** Extra strings that also resolve to this candidate (e.g. inventory code). */
  matchLabels?: string[];
};

function allLabels(c: Candidate): string[] {
  const labels = [c.label, ...(c.matchLabels ?? [])];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of labels) {
    const s = String(raw ?? "").trim();
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

function matchesLabel(c: Candidate, trimmed: string, exact: boolean): boolean {
  const lower = trimmed.toLowerCase();
  return allLabels(c).some((label) =>
    exact ? label === trimmed : label.toLowerCase() === lower
  );
}

async function loadCandidates(
  db: ImportDbLike,
  field: ImportField
): Promise<Candidate[]> {
  const lookup = field.lookup;
  if (!lookup) return [];

  const searchFields =
    lookup.searchFields?.length > 0 ? lookup.searchFields : ["name"];
  const soft = lookup.softDelete !== false;
  const where = soft ? "WHERE deleted_at = none" : "";
  const selectFields = Array.from(new Set(["id", ...searchFields]));
  const [rows] = await db.query(
    `SELECT ${selectFields.join(", ")} FROM ${lookup.table} ${where}`
  );

  return (rows ?? [])
    .map((r: any) => {
      const value = String(r.id ?? "");
      if (!value) return null;

      const primary = String(r[searchFields[0]] ?? "").trim();
      const extras = searchFields
        .slice(1)
        .map((f) => String(r[f] ?? "").trim())
        .filter(Boolean);

      let label = primary;
      if (
        searchFields.includes("name") &&
        searchFields.includes("code") &&
        primary &&
        String(r.code ?? "").trim()
      ) {
        label = `${primary} (${String(r.code).trim()})`;
      } else if (!label && extras.length) {
        label = extras[0];
      }

      const matchLabels = [primary, ...extras].filter(Boolean);
      if (!label && !matchLabels.length) return null;

      return {
        label: label || matchLabels[0],
        value,
        matchLabels: matchLabels.length ? matchLabels : undefined,
      } satisfies Candidate;
    })
    .filter((c: Candidate | null): c is Candidate => Boolean(c?.label && c?.value));
}

function matchOne(
  label: string,
  candidates: Candidate[],
  strategy: string
): {resolved: ResolvedReference; issue?: ImportIssue; fieldName?: string} {
  const trimmed = label.trim();
  if (!trimmed) {
    return {resolved: {label: ""}};
  }

  const lower = trimmed.toLowerCase();
  const dropdownCandidates = candidates.map((c) => ({
    label: c.label,
    value: c.value,
  }));

  if (strategy === "exact") {
    const hits = candidates.filter((c) => matchesLabel(c, trimmed, true));
    if (hits.length === 1) {
      return {resolved: {label: hits[0].label, id: hits[0].value}};
    }
    if (hits.length > 1) {
      return {
        resolved: {label: trimmed, candidates: dropdownCandidates},
        issue: {
          code: "ambiguous_reference",
          severity: "error",
          message: `Multiple matches for "${trimmed}"`,
        },
      };
    }
  }

  if (strategy === "case_insensitive" || strategy === "create" || strategy === "require_selection") {
    const hits = candidates.filter((c) => matchesLabel(c, trimmed, false));
    if (hits.length === 1) {
      return {resolved: {label: hits[0].label, id: hits[0].value}};
    }
    if (hits.length > 1) {
      return {
        resolved: {label: trimmed, candidates: dropdownCandidates},
        issue: {
          code: "ambiguous_reference",
          severity: "error",
          message: `Multiple matches for "${trimmed}"`,
        },
      };
    }
  }

  if (strategy === "fuzzy") {
    // Fuzzy matches display labels only (not alternate codes) to avoid
    // accidental remaps from short codes to similarly spelled names.
    const result = findBestSmartMatch(trimmed, dropdownCandidates);
    if (result?.kind === "match") {
      const canonical = result.match.label;
      const resolved: ResolvedReference = {
        label: canonical,
        id: result.match.value,
      };
      if (!result.exact && canonical.toLowerCase() !== lower) {
        return {
          resolved,
          issue: {
            code: "auto_corrected",
            severity: "warning",
            message: `Matched "${trimmed}" → "${canonical}"`,
          },
        };
      }
      return {resolved};
    }
    if (result?.kind === "ambiguous") {
      return {
        resolved: {label: trimmed, candidates: result.candidates},
        issue: {
          code: "ambiguous_reference",
          severity: "error",
          message: `Multiple matches for "${trimmed}"`,
        },
      };
    }
  }

  if (strategy === "create") {
    return {
      resolved: {label: trimmed, create: true, candidates: dropdownCandidates},
      issue: {
        code: "unresolved_reference",
        severity: "warning",
        message: `"${trimmed}" will be created`,
      },
    };
  }

  // require_selection / exact miss / fuzzy miss — full catalog so the user can pick
  return {
    resolved: {
      label: trimmed,
      candidates: dropdownCandidates,
    },
    issue: {
      code: "unresolved_reference",
      severity: "error",
      message: `Could not resolve "${trimmed}"`,
    },
  };
}

/**
 * Resolve reference fields against the database using configured strategies.
 * Mutates record values in place and appends issues.
 */
export async function resolveReferences(
  config: ImportConfiguration,
  records: ImportRecord[],
  options?: {signal?: AbortSignal}
): Promise<void> {
  const db = config.db;
  if (!db) return;

  const cache = new Map<string, Candidate[]>();

  for (const field of config.fields) {
    throwIfAborted(options?.signal);
    if (!field.lookup) continue;
    if (field.type !== "reference" && field.type !== "reference[]") continue;

    if (!cache.has(field.name)) {
      cache.set(field.name, await loadCandidates(db, field));
    }
    const candidates = cache.get(field.name) || [];
    field.candidates = candidates.map((c) => ({label: c.label, value: c.value}));
    const strategy = field.lookup.strategy;

    for (const record of records) {
      if (field.type === "reference") {
        const current = record.values[field.name] as ResolvedReference | null;
        if (!current?.label) {
          record.values[field.name] = null;
          continue;
        }
        // Already has an id from user selection
        if (current.id) continue;

        const {resolved, issue} = matchOne(current.label, candidates, strategy);
        record.values[field.name] = resolved;
        if (issue) {
          record.issues.push({...issue, field: field.name});
        }
      } else {
        const list = (record.values[field.name] as ResolvedReference[]) || [];
        const next: ResolvedReference[] = [];
        for (const item of list) {
          if (!item?.label) continue;
          if (item.id) {
            next.push(item);
            continue;
          }
          const {resolved, issue} = matchOne(item.label, candidates, strategy);
          next.push(resolved);
          if (issue) {
            record.issues.push({...issue, field: field.name});
          }
        }
        record.values[field.name] = next;
      }
    }
  }
}

/**
 * Create missing references marked `create: true` (no id yet).
 * Prefers config.onCreateMissingReference; otherwise uses db.create with
 * lookup.table + searchFields[0] + createDefaults.
 * Mutates record values in place with the new ids.
 */
export async function ensureCreatedReferences(
  config: ImportConfiguration,
  record: ImportRecord
): Promise<void> {
  const db = config.db;
  if (!db) return;

  for (const field of config.fields) {
    if (!field.lookup) continue;
    if (field.type !== "reference" && field.type !== "reference[]") continue;
    if (field.lookup.strategy !== "create") continue;

    if (field.type === "reference") {
      const ref = record.values[field.name] as ResolvedReference | null;
      if (!ref?.label || ref.id || !ref.create) continue;
      const created = await createOneReference(config, field, ref.label, db);
      record.values[field.name] = {
        label: created.label,
        id: created.id,
        create: false,
      };
    } else {
      const list = (record.values[field.name] as ResolvedReference[]) || [];
      const next: ResolvedReference[] = [];
      for (const item of list) {
        if (!item?.label) continue;
        if (item.id || !item.create) {
          next.push(item);
          continue;
        }
        const created = await createOneReference(config, field, item.label, db);
        next.push({label: created.label, id: created.id, create: false});
      }
      record.values[field.name] = next;
    }
  }
}

async function createOneReference(
  config: ImportConfiguration,
  field: ImportField,
  label: string,
  db: ImportDbLike
): Promise<{id: string; label: string}> {
  const trimmed = label.trim();
  if (!trimmed) {
    throw new Error(`Empty label for field "${field.name}"`);
  }

  // Re-check DB in case another row already created this label in the same batch
  const searchField = field.lookup?.searchFields[0] || "name";
  const soft = field.lookup?.softDelete !== false;
  const softClause = soft ? "AND deleted_at = none" : "";
  const [existing] = await db.query(
    `SELECT id FROM ${field.lookup!.table} WHERE ${searchField} = $label ${softClause} LIMIT 1`,
    {label: trimmed}
  );
  if (existing?.[0]?.id) {
    return {id: String(existing[0].id), label: trimmed};
  }

  if (config.onCreateMissingReference) {
    return config.onCreateMissingReference(field, trimmed, db);
  }

  if (!db.create || !field.lookup?.table) {
    throw new Error(`Cannot create reference for "${trimmed}" (${field.name})`);
  }

  const payload: Record<string, any> = {
    ...(field.lookup.createDefaults ?? {}),
    [searchField]: trimmed,
  };
  const [created] = await db.create(field.lookup.table, payload);
  return {id: String(created.id), label: trimmed};
}
