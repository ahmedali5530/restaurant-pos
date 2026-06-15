'use strict';

/**
 * Backfill production workflows for existing dishes (idempotent).
 *
 * Strategy (matches the "single-stage / preserve parallel" migration choice):
 *   - For every non-deleted dish that has NO workflow yet AND is currently
 *     assigned to EXACTLY ONE kitchen, create a single terminal-stage workflow
 *     pointing at that kitchen and assign it to the dish.
 *   - Dishes assigned to multiple kitchens are LEFT untouched so they keep
 *     today's parallel routing (the app falls back to legacy `kitchen.items ?= dish`
 *     when `menu_item.workflow` is empty). Admins can convert them into
 *     sequential workflows manually later.
 *   - Dishes already carrying a workflow are skipped, so the script is safe to
 *     re-run.
 *
 * Prerequisite: apply migrations/2026_06_14.surql first (creates the
 * `workflow` / `workflow_stage` tables and the `menu_item.workflow` field).
 *
 * Usage (from a context that has `surrealdb` + `ws` installed, e.g. ./payments):
 *   SURREAL_URL=ws://localhost:8000/rpc \
 *   SURREAL_NS=posr SURREAL_DB=posr \
 *   SURREAL_USER=root SURREAL_PASS=root \
 *   node ../migrations/scripts/backfill-workflows.js
 */

const WS = require('ws');
const { Surreal, StringRecordId } = require('surrealdb');

if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = WS;
}

const DB_URL = process.env.SURREAL_URL || 'ws://localhost:8000/rpc';
const DB_NS = process.env.SURREAL_NS || 'posr';
const DB_NAME = process.env.SURREAL_DB || 'posr';
const DB_USER = process.env.SURREAL_USER || 'root';
const DB_PASS = process.env.SURREAL_PASS || 'root';

const rows = (result) => {
  const first = Array.isArray(result) ? result[0] : undefined;
  return Array.isArray(first) ? first : [];
};

async function main() {
  const db = new Surreal();
  await db.connect(DB_URL, {
    namespace: DB_NS,
    database: DB_NAME,
    authentication: { username: DB_USER, password: DB_PASS },
  });

  console.log(`Connected to SurrealDB at ${DB_URL} (${DB_NS}/${DB_NAME})`);

  const dishes = rows(
    await db.query(
      `SELECT id, name, workflow FROM menu_item WHERE deleted_at = none`
    )
  );

  let created = 0;
  let skippedHasWorkflow = 0;
  let skippedNoKitchen = 0;
  let skippedMultiKitchen = 0;

  for (const dish of dishes) {
    const dishId = dish.id.toString();

    if (dish.workflow) {
      skippedHasWorkflow++;
      continue;
    }

    const kitchens = rows(
      await db.query(
        `SELECT id, name FROM kitchen WHERE items ?= $dish AND deleted_at = none`,
        { dish: new StringRecordId(dishId) }
      )
    );

    if (kitchens.length === 0) {
      skippedNoKitchen++;
      continue;
    }

    if (kitchens.length > 1) {
      // Preserve existing parallel behaviour; leave as legacy.
      skippedMultiKitchen++;
      continue;
    }

    const kitchen = kitchens[0];

    const [workflowRecord] = rows(
      await db.query(`CREATE workflow SET name = $name, created_at = time::now()`, {
        name: `${dish.name} Flow`,
      })
    );
    const workflowId = workflowRecord.id.toString();

    await db.query(
      `CREATE workflow_stage SET
         workflow = $workflow,
         kitchen = $kitchen,
         name = $name,
         sequence = 1,
         is_terminal = true,
         created_at = time::now()`,
      {
        workflow: new StringRecordId(workflowId),
        kitchen: new StringRecordId(kitchen.id.toString()),
        name: kitchen.name || 'Default',
      }
    );

    await db.merge(new StringRecordId(dishId), {
      workflow: new StringRecordId(workflowId),
    });

    created++;
    console.log(`  + ${dish.name} -> workflow ${workflowId} (kitchen: ${kitchen.name})`);
  }

  console.log('\nBackfill complete:');
  console.log(`  workflows created:        ${created}`);
  console.log(`  skipped (has workflow):   ${skippedHasWorkflow}`);
  console.log(`  skipped (no kitchen):     ${skippedNoKitchen}`);
  console.log(`  skipped (multi-kitchen):  ${skippedMultiKitchen}`);

  await db.close();
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  });
