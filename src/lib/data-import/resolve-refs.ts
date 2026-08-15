import {throwIfAborted} from "@/lib/data-import/abort.ts";
import {findBestFuzzyMatch} from "@/lib/data-import/fuzzy.ts";
import type {
  ImportConfiguration,
  ImportDbLike,
  ImportField,
  ImportIssue,
  ImportRecord,
  ResolvedReference,
} from "@/lib/data-import/types.ts";

type Candidate = {label: string; value: string};

async function loadCandidates(
  db: ImportDbLike,
  field: ImportField
): Promise<Candidate[]> {
  const lookup = field.lookup;
  if (!lookup) return [];

  const searchField = lookup.searchFields[0] || "name";
  const soft = lookup.softDelete !== false;
  const where = soft ? "WHERE deleted_at = none" : "";
  const [rows] = await db.query(
    `SELECT id, ${searchField} AS label FROM ${lookup.table} ${where}`
  );

  return (rows ?? [])
    .map((r: any) => ({
      label: String(r.label ?? ""),
      value: String(r.id ?? ""),
    }))
    .filter((c: Candidate) => c.label && c.value);
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

  if (strategy === "exact") {
    const hits = candidates.filter((c) => c.label === trimmed);
    if (hits.length === 1) {
      return {resolved: {label: trimmed, id: hits[0].value}};
    }
    if (hits.length > 1) {
      return {
        resolved: {label: trimmed, candidates: hits},
        issue: {
          code: "ambiguous_reference",
          severity: "error",
          message: `Multiple matches for "${trimmed}"`,
        },
      };
    }
  }

  if (strategy === "case_insensitive" || strategy === "create" || strategy === "require_selection") {
    const hits = candidates.filter((c) => c.label.toLowerCase() === lower);
    if (hits.length === 1) {
      return {resolved: {label: trimmed, id: hits[0].value}};
    }
    if (hits.length > 1) {
      return {
        resolved: {label: trimmed, candidates: hits},
        issue: {
          code: "ambiguous_reference",
          severity: "error",
          message: `Multiple matches for "${trimmed}"`,
        },
      };
    }
  }

  if (strategy === "fuzzy") {
    const best = findBestFuzzyMatch(trimmed, candidates);
    if (best) {
      return {resolved: {label: trimmed, id: best.match.value}};
    }
  }

  if (strategy === "create") {
    return {
      resolved: {label: trimmed, create: true},
      issue: {
        code: "unresolved_reference",
        severity: "warning",
        message: `"${trimmed}" will be created`,
      },
    };
  }

  // require_selection / exact miss / fuzzy miss
  const fuzzyHints = candidates
    .map((c) => ({c, score: findBestFuzzyMatch(trimmed, [c], 0.4)?.score ?? 0}))
    .filter((x) => x.score >= 0.4)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((x) => x.c);

  return {
    resolved: {
      label: trimmed,
      candidates: fuzzyHints.length ? fuzzyHints : candidates.slice(0, 20),
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

