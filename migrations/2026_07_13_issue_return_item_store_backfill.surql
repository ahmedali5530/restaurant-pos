-- Backfill store on issue return line items from the original issue item store.
-- Historical returns were saved without store, so inventory queries filtering by
-- store = $store never counted them.

UPDATE inventory_issue_return_item
SET store = issued_item.store
WHERE (store = NONE OR store = NULL)
  AND issued_item != NONE
  AND issued_item.store != NONE;
