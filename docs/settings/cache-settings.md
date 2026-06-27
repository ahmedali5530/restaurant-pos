# Cache Settings

## Purpose

Manage the application's data cache by manually reloading data from the database. This ensures that the application has the most current information from the database, including menus, dishes, categories, tables, floors, kitchens, payment types, and other core data entities.

## Features

- **Manual cache refresh**: Reload all application data from the database with a single click
- **Cache statistics**: Display the count of cached items for each data type
- **Comprehensive data refresh**: Fetches all core data entities in a single operation
- **IndexedDB storage**: Documents are stored in browser's IndexedDB for offline access
- **Error handling**: Provides feedback on successful or failed cache reload

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Cache Settings card
3. View the current cache statistics (if displayed)
4. Click the "Reload" button
5. Wait for the reload process to complete (button shows loading state)
6. Receive success or error notification
7. Cache is updated with the latest data from the database

## Business Rules

- **Automatic on load**: Cache is automatically loaded when the application starts
- **Manual refresh**: Users can manually refresh cache to get latest data
- **All-or-nothing**: Cache reload fetches all data types; cannot selectively refresh specific types
- **Priority ordering**: Data is fetched in priority order (as configured in database)
- **Deleted items excluded**: Only items with `deleted_at = none` are loaded
- **Document storage**: Documents are stored separately in IndexedDB

## Permissions

- **No login required**: Cache can be reloaded by any user
- **No special permissions**: All users have access to cache refresh functionality
- **Database access**: Requires database connectivity to reload cache

## Data Types Cached

The cache reload fetches the following data types:

### Order Types
- **Purpose**: Available order types (dine-in, takeout, delivery, etc.)
- **Filter**: Only active order types (deleted_at = none)
- **Order**: Priority ascending

### Categories
- **Purpose**: Menu categories for organizing dishes
- **Filter**: Only active categories (deleted_at = none)
- **Order**: Priority ascending

### Dishes
- **Purpose**: All menu items and dishes
- **Filter**: Only active dishes (deleted_at = none)
- **Order**: Priority ascending
- **Related data**: Fetches dish details, modifiers, and related information

### Modifier Groups
- **Purpose**: Groups of modifiers that can be added to dishes
- **Filter**: Only active modifier groups (deleted_at = none)
- **Order**: Priority ascending
- **Related data**: Fetches modifiers, allowed next groups, and overrides

### Dish Modifier Groups
- **Purpose**: Associations between dishes and modifier groups
- **Order**: Priority ascending
- **Related data**: Fetches input/output groups and modifier details

### Floors
- **Purpose**: Restaurant floor plans for table organization
- **Filter**: Only active floors (deleted_at = none)
- **Order**: Priority ascending

### Tables
- **Purpose**: Individual tables within floors
- **Filter**: Only active tables (deleted_at = none)
- **Order**: Priority ascending
- **Related data**: Fetches table details and floor information

### Kitchens
- **Purpose**: Kitchen stations for order routing
- **Filter**: Only active kitchens (deleted_at = none)
- **Order**: Priority ascending
- **Related data**: Fetches kitchen details and printer information

### Payment Types
- **Purpose**: Available payment methods (cash, card, etc.)
- **Filter**: Only active payment types (deleted_at = none)
- **Order**: Priority ascending
- **Related data**: Fetches payment type details

### Menus
- **Purpose**: Active menu configurations
- **Filter**: Only menus marked as active and not deleted
- **Selection**: Only menus selected in Menu Settings are loaded
- **Related data**: Fetches menu items, categories, and tax information

### Documents
- **Purpose**: Document storage for offline access
- **Storage**: Stored in IndexedDB (browser database)
- **Content**: Document ID and content

## Edge Cases

- **Network failure**: Cache reload will fail if database connection is lost
- **Database downtime**: Cannot reload cache if database is unavailable
- **Large datasets**: Reload may take longer for restaurants with extensive menus/data
- **Concurrent modifications**: Changes made during reload may not be reflected until next reload
- **Menu selection changes**: If menu selection changes, cache must be reloaded to update available menus
- **IndexedDB quota**: Browser may limit storage space for documents

## Configuration

Cache settings are stored in the application state (Jotai atom):

- **order_types**: Array of order type objects
- **categories**: Array of category objects
- **dishes**: Array of dish objects
- **modifier_groups**: Array of modifier group objects
- **groups_dishes**: Array of dish-modifier group associations
- **floors**: Array of floor objects
- **tables**: Array of table objects
- **kitchens**: Array of kitchen objects
- **payment_types**: Array of payment type objects
- **menus**: Array of menu objects

Documents are stored in IndexedDB with key: `documents`

## Known Limitations

- **No selective refresh**: Cannot refresh specific data types; must refresh all
- **No automatic refresh**: Cache does not automatically refresh on database changes
- **No cache size management**: No indication of cache size or storage limits
- **No incremental updates**: Full reload required even for small changes
- **No conflict resolution**: No handling of concurrent modifications during reload
- **No offline mode indicator**: No indication when working with stale cache

## Future Extension Points

- **Selective cache refresh**: Allow users to refresh specific data types
- **Automatic cache refresh**: Periodic automatic refresh or refresh on database change notification
- **Cache size management**: Display cache size and provide options to clear specific data
- **Incremental updates**: Only fetch changed data instead of full reload
- **Conflict resolution**: Handle concurrent modifications during cache reload
- **Offline mode indicator**: Show when working with stale cache and when last refresh occurred
- **Background refresh**: Refresh cache in background without blocking UI
- **Cache validation**: Verify cache integrity and detect corrupted data
