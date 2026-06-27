# Table Selection Settings

## Purpose

Show or hide the table selection interface in the restaurant POS application. This setting allows you to control whether users can select tables when creating orders, which is useful for different operational workflows (e.g., takeout-only operations may not need table selection).

## Features

- **Simple toggle**: Easy on/off switch for table selection interface
- **Instant application**: Changes take effect immediately without page refresh
- **Session-based**: Setting is maintained during the current session
- **Visual feedback**: Button color indicates current state (green for enabled, red for disabled)
- **Workflow flexibility**: Supports different operational modes (dine-in vs takeout)

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Table Selection Settings card
3. View the current state (button shows "Enabled" or "Disabled")
4. Click the button to toggle table selection visibility
5. Button color changes to indicate new state
6. Table selection interface immediately shows or hides based on setting

## Business Rules

- **Session-based**: Table selection setting is maintained during the current browser session
- **No database storage**: Setting is not permanently saved to the database
- **Instant application**: Changes take effect immediately without requiring save action
- **Default state**: Default state is determined by application initialization
- **Global within session**: Setting affects the entire application during the session

## Permissions

- **No login required**: Table selection settings can be changed by any user
- **No special permissions**: All users have access to table selection toggle
- **Session-based only**: Settings reset to default when session ends or browser is closed

## Fields

### Hide Table Selection Toggle
- **Purpose**: Show or hide the table selection interface
- **Type**: Button toggle
- **States**:
  - Enabled (green button, text "Enabled") - Table selection is hidden
  - Disabled (red button, text "Disabled") - Table selection is shown
- **Default**: Determined by application initialization
- **Behavior**: Instant application, no save button required
- **Note**: Button label indicates the state of "hiding" table selection, not showing it

## Edge Cases

- **Session expiration**: Table selection preference is lost when the browser session ends or cache is cleared
- **Order creation workflow**: If table selection is hidden, orders may be created without table assignment
- **Existing orders**: Hiding table selection does not affect existing orders with table assignments
- **Table management**: Users can still manage tables even if table selection is hidden
- **Multiple tabs**: Setting may not sync across multiple browser tabs
- **Floor plan**: Hiding table selection may also hide floor plan interface

## Configuration

Setting is stored in the application state (Jotai atom):

- **hideTableSelection**: Boolean (true for hidden, false for shown)

This setting is:
- **Session-based**: Stored in browser memory during the session
- **Not persistent**: Not saved to database or local storage
- **Global**: Affects the entire application interface during the session

## Operational Impact

### When Table Selection is Hidden
- **No table prompt**: Users are not prompted to select a table when creating orders
- **Simplified workflow**: Order creation process is faster for takeout or delivery orders
- **Table assignment optional**: Orders can be created without table assignment
- **Floor plan access**: Floor plan interface may also be hidden or inaccessible

### When Table Selection is Shown
- **Table prompt**: Users are prompted to select a table when creating orders
- **Table assignment**: Orders are associated with selected tables
- **Floor plan access**: Floor plan interface is accessible for table selection
- **Dine-in workflow**: Supports traditional dine-in restaurant operations

## Use Cases

### Hide Table Selection
- **Takeout-only operations**: Restaurants that only handle takeout orders
- **Delivery-only operations**: Restaurants that only handle delivery orders
- **Counter service**: Fast food or counter service restaurants
- **Kiosk mode**: Self-service kiosks where table selection is not needed

### Show Table Selection
- **Dine-in operations**: Traditional sit-down restaurants
- **Full-service restaurants**: Restaurants with table service
- **Bar operations**: Bars and lounges with seating
- **Multi-floor venues**: Restaurants with multiple floors or seating areas

## Known Limitations

- **No persistence**: Setting is not saved; resets on each session
- **No per-user memory**: Cannot remember table selection preference per user
- **No automatic detection**: Does not automatically detect operational mode
- **No conditional logic**: Cannot show/hide based on order type or user role
- **No partial hiding**: Cannot hide specific table selection features while showing others

## Future Extension Points

- **User persistence**: Save table selection preference per user in the database
- **Automatic detection**: Automatically detect operational mode based on order types
- **Per-user memory**: Remember table selection preference per user
- **Conditional logic**: Show/hide based on order type, time of day, or user role
- **Partial hiding**: Configure which table selection features are shown/hidden
- **Order type association**: Automatically show/hide based on selected order type
- **Per-device settings**: Different table selection settings for different devices
- **Workflow templates**: Pre-defined workflow templates with table selection settings
