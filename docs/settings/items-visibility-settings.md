# Items Visibility Settings

## Purpose

Configure which information is displayed in the cart and order cards throughout the restaurant POS application. This allows you to customize the interface to show or hide specific details such as totals, quantities, prices, modifiers, and other item information based on your operational preferences.

## Features

- **Cart visibility controls**: Configure what information shows in the shopping cart
- **Order card visibility controls**: Configure what information shows in order cards
- **Multiple toggles**: Six independent visibility toggles for different data points
- **Instant application**: Changes take effect immediately without page refresh
- **Session-based**: Settings are maintained during the current session
- **Default to visible**: All options default to visible (enabled)

## User Workflow

### Cart Visibility Settings

1. Navigate to Settings page (`/settings`)
2. Locate the Items Visibility Settings card
3. Find the "Cart" section
4. Toggle the "Show Totals in Cart" switch to show or hide cart totals
5. Changes take effect immediately

### Order Card Visibility Settings

1. In the same Items Visibility Settings card
2. Find the "Orders" section
3. Toggle any of the following switches:
   - Show Total in Order Card
   - Show Groups in Order Card
   - Show Quantity in Order Card
   - Show Price in Order Card
   - Show Modifiers in Order Card
   - Show Modifier Price in Order Card
4. Changes take effect immediately

## Business Rules

- **Session-based**: Visibility settings are maintained during the current browser session
- **No database storage**: Settings are not permanently saved to the database
- **Instant application**: Changes take effect immediately without requiring save action
- **Default to visible**: All visibility options default to visible (true)
- **Independent toggles**: Each visibility option can be controlled independently
- **Global within session**: Settings affect the entire application interface during the session

## Permissions

- **No login required**: Items visibility settings can be changed by any user
- **No special permissions**: All users have access to visibility toggles
- **Session-based only**: Settings reset to default when session ends or browser is closed

## Fields

### Cart Visibility

#### Show Totals in Cart
- **Purpose**: Display or hide total amounts in the shopping cart
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Cart totals are displayed
  - Off (unchecked) - Cart totals are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of subtotal, tax, and total in cart

### Order Card Visibility

#### Show Total in Order Card
- **Purpose**: Display or hide total amounts in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Order totals are displayed
  - Off (unchecked) - Order totals are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of order total in order cards

#### Show Groups in Order Card
- **Purpose**: Display or hide item groups in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Item groups are displayed
  - Off (unchecked) - Item groups are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of grouped items in order cards

#### Show Quantity in Order Card
- **Purpose**: Display or hide item quantities in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Item quantities are displayed
  - Off (unchecked) - Item quantities are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of item quantities in order cards

#### Show Price in Order Card
- **Purpose**: Display or hide item prices in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Item prices are displayed
  - Off (unchecked) - Item prices are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of individual item prices in order cards

#### Show Modifiers in Order Card
- **Purpose**: Display or hide item modifiers in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Item modifiers are displayed
  - Off (unchecked) - Item modifiers are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of modifier names in order cards

#### Show Modifier Price in Order Card
- **Purpose**: Display or hide modifier prices in order cards
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Modifier prices are displayed
  - Off (unchecked) - Modifier prices are hidden
- **Default**: On (true)
- **Behavior**: Controls visibility of modifier price amounts in order cards

## Edge Cases

- **Session expiration**: Visibility preferences are lost when the browser session ends or cache is cleared
- **Interface layout**: Hiding certain elements may affect interface layout and spacing
- **User confusion**: Hiding critical information like prices or totals may confuse users
- **Receipt printing**: Visibility settings do not affect receipt printing
- **Multiple tabs**: Settings may not sync across multiple browser tabs
- **Empty states**: Hiding all information may result in empty or confusing order cards

## Configuration

Settings are stored in the application state (Jotai atom):

- **menuConfig**: Object containing visibility flags:
  - **showTotalInCart**: Boolean (true for visible, false for hidden)
  - **showTotalInOrderCard**: Boolean (true for visible, false for hidden)
  - **showGroupsInOrderCard**: Boolean (true for visible, false for hidden)
  - **showQuantityInOrderCard**: Boolean (true for visible, false for hidden)
  - **showPriceInOrderCard**: Boolean (true for visible, false for hidden)
  - **showModifiersInOrderCard**: Boolean (true for visible, false for hidden)
  - **showModifierPriceInOrderCard**: Boolean (true for visible, false for hidden)

These settings are:
- **Session-based**: Stored in browser memory during the session
- **Not persistent**: Not saved to database or local storage
- **Global**: Affect the entire application interface during the session

## Use Cases

### Minimal Interface
- **Hide all prices**: Hide prices and totals for customer-facing displays
- **Hide modifiers**: Simplify interface by hiding modifier details
- **Hide quantities**: Reduce clutter for simple orders

### Detailed Interface
- **Show all information**: Display all available information for detailed order management
- **Show modifier prices**: Display modifier prices for accurate order review
- **Show groups**: Display item groups for complex orders

### Customer-Facing Display
- **Hide prices**: Hide prices on customer-facing displays
- **Show totals**: Show totals for customer transparency
- **Show modifiers**: Show modifiers for customer order confirmation

### Staff-Facing Display
- **Show all information**: Display all details for staff order management
- **Show modifier prices**: Show modifier prices for accurate order entry
- **Show groups**: Show groups for complex order organization

## Known Limitations

- **No persistence**: Settings are not saved; resets on each session
- **No per-user memory**: Cannot remember visibility preference per user
- **No per-module settings**: Cannot configure different visibility for different sections
- **No conditional visibility**: Cannot show/hide based on user role or order type
- **No custom layouts**: Cannot customize the layout or position of information
- **No grouping**: Cannot group related visibility toggles together

## Future Extension Points

- **User persistence**: Save visibility preference per user in the database
- **Per-user memory**: Remember visibility preference per user
- **Per-module settings**: Configure different visibility for different sections (cart vs order card vs kitchen display)
- **Conditional visibility**: Show/hide based on user role, order type, or customer type
- **Custom layouts**: Customize the layout and position of information
- **Visibility profiles**: Create pre-defined visibility profiles for different use cases
- **Per-device settings**: Different visibility settings for different devices
- **Field-level control**: More granular control over specific fields and data points
- **Preview**: Preview interface changes before applying visibility settings
