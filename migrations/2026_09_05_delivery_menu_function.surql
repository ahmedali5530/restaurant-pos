-- Server-side delivery menu payload for the customer app.
-- Replaces the customer app's heavy multi-level FETCH query with a single
-- fn::delivery_menu() RPC call (fixes 12s+ menu loads over HTTP JSON-RPC).
-- The dish_photo documents are intentionally NOT fetched inline — the app
-- loads images per-document via encoding::base64::encode.

DEFINE FUNCTION OVERWRITE fn::delivery_menu() {
	LET $setting = (SELECT * FROM setting WHERE key = 'delivery_menu' LIMIT 1 FETCH
		values,
		values.items.menu_menu_item,
		values.items.menu_item,
		values.items.menu_item.categories
	);
	RETURN $setting;
} PERMISSIONS FULL;
