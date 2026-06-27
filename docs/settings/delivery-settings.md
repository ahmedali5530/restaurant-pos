# Delivery Settings

## Purpose

Configure comprehensive delivery service settings for the restaurant POS system. This includes enabling/disabling delivery, setting charges and minimum order amounts, configuring delivery timing schedules, selecting delivery menus, setting map coordinates for delivery zones, and managing delivery banners.

## Features

- **Enable/disable delivery**: Turn delivery service on or off
- **Charge configuration**: Set delivery charges and minimum order amounts
- **Timing schedules**: Configure delivery availability by day of week and custom dates
- **Menu selection**: Choose which menu is used for delivery orders
- **Map center**: Set geographic coordinates for delivery zone mapping
- **Custom dates**: Add special delivery dates with custom timing
- **Delivery time estimation**: Configure estimated delivery time for customers
- **Form validation**: Ensures required fields are properly configured

## User Workflow

1. Navigate to Delivery Settings page (`/delivery/settings`)
2. Toggle "Enable Delivery" checkbox to turn delivery on or off
3. Enter "Delivery Charges" (amount charged for delivery)
4. Enter "Minimum Order" (minimum order amount required for delivery)
5. Enter "Delivery Time" (estimated delivery time in minutes)
6. Select "Delivery Menu" from the dropdown
7. Configure "Map Center" coordinates:
   - Enter Latitude
   - Enter Longitude
8. Configure "Delivery Timing" for each day:
   - Set Start Time
   - Set End Time
   - Check "End Time Next Day" if delivery ends after midnight
   - Check "Enable Delivery" for that day
9. Add custom dates if needed:
   - Click "Add Custom Date" button
   - Set date, times, and enable/disable for that date
10. Click "Save Settings" button
11. Wait for confirmation message

## Business Rules

- **Global setting**: Delivery settings apply to all delivery operations
- **Required fields**: Delivery menu, charges, minimum order, and map center are required when delivery is enabled
- **Default timing**: Default timing is 11:00 to 00:00 with end time next day enabled
- **All days included**: Default configuration includes all 7 days of the week
- **Custom dates**: Can add unlimited custom dates with individual timing
- **Validation**: Numeric fields must be positive numbers
- **Menu filtering**: Only active menus appear in the delivery menu dropdown

## Permissions

- **No login required**: Delivery settings can be configured without login
- **No special permissions**: All users can access and modify delivery settings
- **Global impact**: Changes affect all delivery operations immediately

## Fields

### Enable Delivery
- **Purpose**: Turn the delivery service on or off
- **Type**: Checkbox
- **Options**: 
  - Checked - Delivery service is enabled
  - Unchecked - Delivery service is disabled
- **Default**: Unchecked (false)
- **Behavior**: When disabled, all delivery features are turned off

### Delivery Charges
- **Purpose**: Set the amount charged for delivery
- **Type**: Numeric input
- **Validation**: Must be a positive number
- **Default**: 0
- **Behavior**: Amount added to order total for delivery orders

### Minimum Order
- **Purpose**: Set the minimum order amount required for delivery
- **Type**: Numeric input
- **Validation**: Must be a positive number
- **Default**: 0
- **Behavior**: Orders below this amount cannot be placed for delivery

### Delivery Time
- **Purpose**: Set the estimated delivery time shown to customers
- **Type**: Numeric input
- **Validation**: Must be a positive number
- **Unit**: Minutes
- **Default**: 0
- **Behavior**: Displayed to customers as estimated delivery time

### Delivery Menu
- **Purpose**: Select which menu is used for delivery orders
- **Type**: Dropdown selection
- **Options**: All active menus in the system
- **Display**: Shows menu name
- **Default**: None
- **Validation**: Required when delivery is enabled
- **Behavior**: Only items from this menu are available for delivery

### Map Center

#### Latitude
- **Purpose**: Set the latitude coordinate for delivery zone center
- **Type**: Numeric input
- **Validation**: Must be a valid latitude (-90 to 90)
- **Precision**: 6 decimal places
- **Default**: 31.512196
- **Behavior**: Used as center point for delivery zone mapping

#### Longitude
- **Purpose**: Set the longitude coordinate for delivery zone center
- **Type**: Numeric input
- **Validation**: Must be a valid longitude (-180 to 180)
- **Precision**: 6 decimal places
- **Default**: 74.322242
- **Behavior**: Used as center point for delivery zone mapping

### Delivery Timing

#### Day of Week / Date
- **Purpose**: Identify the day or date for delivery timing
- **Type**: 
  - Text input for days of week (disabled for default days)
  - Date picker for custom dates
- **Options**: Monday through Sunday (default), or custom dates
- **Default**: All 7 days of week
- **Behavior**: Each entry represents a day or date with its own timing

#### Start Time
- **Purpose**: Set when delivery becomes available for this day/date
- **Type**: Time input (24-hour format)
- **Format**: HH:MM
- **Default**: 11:00
- **Behavior**: Delivery orders can be placed after this time

#### End Time
- **Purpose**: Set when delivery ends for this day/date
- **Type**: Time input (24-hour format)
- **Format**: HH:MM
- **Default**: 00:00
- **Behavior**: Delivery orders cannot be placed after this time

#### End Time Next Day
- **Purpose**: Indicate if end time is on the next day
- **Type**: Checkbox
- **Options**: 
  - Checked - End time is on the next day
  - Unchecked - End time is on the same day
- **Default**: Checked (true)
- **Behavior**: Allows delivery schedules that cross midnight

#### Enable Delivery
- **Purpose**: Enable or disable delivery for this specific day/date
- **Type**: Checkbox
- **Options**: 
  - Checked - Delivery is available for this day/date
  - Unchecked - Delivery is not available for this day/date
- **Default**: Checked (true)
- **Behavior**: When unchecked, no delivery orders can be placed on this day/date

## Edge Cases

- **No menus available**: If no active menus exist, delivery menu dropdown will be empty
- **Menu deletion**: If selected delivery menu is deleted, setting becomes invalid
- **Invalid coordinates**: Invalid latitude/longitude may cause map display issues
- **Time range conflicts**: Overlapping or invalid time ranges may cause confusion
- **Custom date deletion**: Custom dates can be deleted but default days cannot
- **Zero charges/minimum**: Setting charges or minimum order to zero may not be desirable
- **Delivery time zero**: Zero delivery time may confuse customers

## Configuration

Settings are stored in the database with the following structure:

- **enable_delivery**: Boolean (true or false)
- **delivery_charges**: Number (delivery charge amount)
- **minimum_order**: Number (minimum order amount)
- **delivery_time**: Number (estimated delivery time in minutes)
- **delivery_menu**: Menu record ID
- **map_center**: Object containing:
  - **lat**: Number (latitude)
  - **lng**: Number (longitude)
- **delivery_timing**: Array of objects, each containing:
  - **id**: String (unique identifier)
  - **day_or_date**: String (day name or date)
  - **start_time**: String (HH:MM format)
  - **end_time**: String (HH:MM format)
  - **is_end_time_next_day**: Boolean
  - **enable_delivery**: Boolean

## Default Configuration

The system provides default delivery timing for all 7 days of the week:

- **Day**: Monday through Sunday
- **Start Time**: 11:00
- **End Time**: 00:00
- **End Time Next Day**: true
- **Enable Delivery**: true

## Known Limitations

- **Single delivery menu**: Only one menu can be selected for delivery
- **No zone-based pricing**: Cannot configure different charges for different delivery zones
- **No dynamic pricing**: Delivery charges are fixed regardless of order size or distance
- **No driver assignment**: No driver assignment or tracking features
- **No delivery radius**: No automatic delivery radius calculation based on coordinates
- **No time-based pricing**: Cannot configure different charges based on time of day
- **No order type filtering**: Cannot restrict specific order types to delivery
- **No customer restrictions**: Cannot configure delivery restrictions per customer

## Future Extension Points

- **Multiple delivery menus**: Support for multiple delivery menus with different conditions
- **Zone-based pricing**: Configure different delivery charges for different zones
- **Dynamic pricing**: Calculate delivery charges based on distance or order size
- **Driver assignment**: Assign drivers to delivery orders with tracking
- **Delivery radius**: Automatically calculate and enforce delivery radius
- **Time-based pricing**: Configure different charges based on time of day
- **Order type filtering**: Restrict specific order types to delivery
- **Customer restrictions**: Configure delivery restrictions per customer or customer tier
- **Delivery scheduling**: Allow customers to schedule future delivery times
- **Delivery fees**: Add complex fee structures (base fee + per-mile fee)
- **Delivery zones**: Create and manage delivery zones with polygon boundaries
- **Real-time tracking**: Integrate with delivery tracking services
