import {Tables} from "@/api/db/tables.ts";
import type {Setting} from "@/api/model/setting.ts";

export const DISH_COMMENT_TAGS_KEY = "dish_comment_tags";

export interface DishCommentTagsSettings {
  /** Quick phrases shown on the dish-comment virtual keyboard. */
  tags: string[];
}

export const DEFAULT_DISH_COMMENT_TAGS: DishCommentTagsSettings = {
  tags: [],
};

export function normalizeDishCommentTags(values: any): string[] {
  const raw = Array.isArray(values?.tags) ? values.tags : [];
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const item of raw) {
    const tag = String(item ?? "").trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return tags;
}

/** Load global dish-comment quick tags (empty array when unset). */
export async function loadDishCommentTags(db: any): Promise<string[]> {
  const [rows] = await db.query(
    `SELECT * FROM ${Tables.settings} WHERE key = $key AND is_global = true LIMIT 1`,
    {key: DISH_COMMENT_TAGS_KEY},
  );
  return normalizeDishCommentTags((rows?.[0] as Setting | undefined)?.values);
}
