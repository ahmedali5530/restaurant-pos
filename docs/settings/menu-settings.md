# Menu Settings

## Purpose

Select which menus are active and available in the restaurant POS application. This allows you to control which menu configurations are displayed to users and used for order processing.

## Features

- **Multi-menu selection**: Activate multiple menus simultaneously
- **Global configuration**: Menu selection applies to all users
- **Priority ordering**: Menus are displayed in priority order
- **Active filter**: Only active and non-deleted menus appear in the selection
- **Instant cache update**: Menu cache is automatically updated when settings are saved

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Menu Settings card
3. Click the "Activate Menus" dropdown field
4. Select one or more menus from the available list
5. Click the "Save" button
6. Wait for confirmation message
7. Selected menus are now active in the application

## Business Rules

- **Global setting**: Menu selection affects all users in the system
- **Active menus only**: Only menus marked as active and not deleted appear in the dropdown
- **Priority display**: Menus are displayed in priority order (as configured in menu settings)
- **Cache update**: Saving menu settings automatically updates the application cache
- **Empty selection**: It is possible to have no menus selected (though not recommended)
- **Menu loading**: Only selected menus are loaded into the application cache

## Permissions

- **Login required**: You must be logged in to save menu settings
- **No special permissions**: All logged-in users can configure menu settings
- **Global impact**: Changes affect all users, not just the current user

## Fields

### Activate Menus
- **Purpose**: Select which menus are active in the application
- **Type**: Multi-select dropdown
- **Options**: All active and non-deleted menus in the system
- **Display**: Shows menu name in dropdown
- **Default**: None (no menus selected)
- **Behavior**: Multiple menus can be selected simultaneously

## Edge Cases

- **No menus available**: If no active menus exist in the system, the dropdown will be empty
- **Menu deletion**: If a selected menu is deleted, it will be removed from the active selection
- **Menu deactivation**: If a selected menu is deactivated, it will be removed from the active selection
- **Empty selection**: If no menus are selected, the application will have no menu data available
- **Concurrent changes**: If another user modifies menu settings, changes may be overwritten
- **Cache reload**: Menu cache must be reloaded if menu settings are changed elsewhere

## Configuration

Settings are stored in the database with the following structure:

- **Key**: `menus`
- **Is Global**: `true` (applies to all users)
- **Values**: Array of menu record IDs

Each menu in the values array contains:
- **Menu ID**: The unique identifier of the menu
- **Menu data**: Full menu object including items, categories, and tax information

## Menu Data Loaded

When menus are activated, the following data is loaded for each selected menu:

- **Menu details**: Menu name, description, priority
- **Menu items**: All items in the menu
- **Menu item details**: Dish information for each menu item
- **Categories**: Categories associated with menu items
- **Tax information**: Tax rates and configurations for menu items

## Known Limitations

- **Single menu set**: Cannot configure different menus for different users or roles
- **No time-based activation**: Cannot automatically activate menus based on time of day or date
- **No conditional menus**: Cannot show different menus based on order type (dine-in vs delivery)
- **No menu hierarchy**: All selected menus are shown equally; no parent-child menu relationships
- **No menu preview**: Cannot preview menu contents before selection
- **All-or-nothing**: Cannot selectively load parts of a menu

## Future Extension Points

- **User-specific menus**: Allow different users to have different menu configurations
- **Time-based activation**: Automatically activate/deactivate menus based on schedules
- **Conditional menus**: Show different menus based on order type, customer type, or other conditions
- **Menu hierarchy**: Support parent-child menu relationships and inheritance
- **Menu preview**: Display menu contents and item counts in the selection dropdown
- **Selective loading**: Load only specific parts of a menu (e.g., categories without items)
- **Menu templates**: Create menu templates for quick activation
- **Menu versioning**: Support multiple versions of the same menu with version control
