# Service Charges Settings

## Purpose

Configure automatic service charges that are applied to orders in the restaurant POS system. This allows you to set a fixed amount or percentage-based service charge that is automatically added to customer bills.

## Features

- **Two charge types**: Support for fixed amount or percentage-based service charges
- **Global configuration**: Service charge settings apply to all orders in the system
- **Flexible calculation**: Choose between fixed currency amount or percentage of subtotal
- **Simple interface**: Easy-to-use form with type selection and value input

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Service Charges Settings card
3. Select the charge type from the dropdown:
   - "Fixed" for a fixed currency amount
   - "Percent" for a percentage of the order subtotal
4. Enter the charge value:
   - For Fixed: Enter the currency amount (e.g., 5.00)
   - For Percent: Enter the percentage (e.g., 10 for 10%)
5. Click the "Save" button
6. Wait for confirmation message
7. Service charge is now applied to all orders

## Business Rules

- **Global setting**: Service charge applies to all orders and all users
- **Type-based calculation**: 
  - Fixed: Adds the exact amount to the order total
  - Percent: Calculates the charge as a percentage of the order subtotal
- **No minimum/maximum**: No built-in limits on service charge amount
- **Automatic application**: Service charge is automatically calculated and added to orders
- **Zero value**: Can be set to zero to disable service charges

## Permissions

- **No login required**: Service charge settings can be configured without login
- **No special permissions**: All users can access and modify service charge settings
- **Global impact**: Changes affect all orders immediately

## Fields

### Type
- **Purpose**: Select how the service charge is calculated
- **Type**: Dropdown selection
- **Options**:
  - "Fixed" - Adds a fixed currency amount to each order
  - "Percent" - Calculates charge as percentage of order subtotal
- **Default**: "Percent"
- **Behavior**: Determines how the value field is interpreted

### Value
- **Purpose**: Set the amount of the service charge
- **Type**: Numeric input
- **Validation**: Must be a valid number
- **Default**: 0
- **Behavior**:
  - When Type is "Fixed": Value is the currency amount (e.g., 5.00 = $5.00)
  - When Type is "Percent": Value is the percentage (e.g., 10 = 10%)

## Edge Cases

- **Negative values**: System does not prevent negative values (may cause issues)
- **Zero value**: Setting value to 0 effectively disables service charges
- **Very high values**: No validation on maximum values; may result in unexpectedly high charges
- **Type change confusion**: Changing type without updating value may result in incorrect charges
- **Decimal precision**: Fixed charges support decimal values; percentages typically use whole numbers
- **Order subtotal zero**: If order subtotal is zero, percentage-based charge will be zero

## Configuration

Settings are stored in the database with the following structure:

- **Key**: `service_charges`
- **Is Global**: `true` (applies to all orders)
- **Values**: Object containing:
  - **type**: String ("Fixed" or "Percent")
  - **value**: Number (the charge amount or percentage)

## Calculation Examples

### Fixed Charge
- **Type**: Fixed
- **Value**: 5.00
- **Order Subtotal**: $50.00
- **Service Charge**: $5.00
- **Total**: $55.00

### Percentage Charge
- **Type**: Percent
- **Value**: 10
- **Order Subtotal**: $50.00
- **Service Charge**: $5.00 (10% of $50.00)
- **Total**: $55.00

## Known Limitations

- **Single service charge**: Only one service charge can be configured; cannot have multiple service charges
- **No conditional charges**: Cannot apply different service charges based on order type, time, or customer
- **No exemptions**: Cannot exempt specific orders or customers from service charges
- **No tax interaction**: Service charge tax treatment is not configurable
- **No rounding rules**: No control over how percentage charges are rounded
- **No display customization**: Cannot customize how service charge appears on receipts

## Future Extension Points

- **Multiple service charges**: Support for multiple service charges with different conditions
- **Conditional charges**: Apply different charges based on order type, time of day, or customer type
- **Exemptions**: Configure exemptions for specific order types, customers, or situations
- **Tax configuration**: Configure whether service charge is taxable and how it's taxed
- **Rounding rules**: Configure rounding behavior for percentage-based charges
- **Display customization**: Customize service charge label and appearance on receipts
- **Minimum charge**: Set minimum service charge amount
- **Maximum charge**: Set maximum service charge amount or cap
- **Tiered charges**: Implement tiered service charges based on order amount
