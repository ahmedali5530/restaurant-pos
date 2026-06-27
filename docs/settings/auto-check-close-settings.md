# Auto Check Close Settings

## Purpose

Configure automatic check closing functionality that automatically closes open checks at the end of the closing cycle. This feature helps ensure all checks are properly closed and accounted for at the end of each business day.

## Features

- **Enable/disable**: Turn automatic check closing on or off
- **Payment type selection**: Choose which payment type to use when auto-closing checks
- **Print on close**: Option to automatically print receipts when checks are closed
- **Cycle tracking**: Tracks the last closed cycle to avoid duplicate closures
- **Validation**: Requires payment type selection when feature is enabled

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Auto Check Close Settings card
3. Toggle the "Enabled" switch to turn the feature on or off
4. If enabled, select a payment type from the dropdown (required)
5. Toggle the "Print on Close" switch if you want receipts printed automatically
6. Click the "Save" button
7. Wait for confirmation message
8. Auto check close is now configured

## Business Rules

- **Global setting**: Auto check close configuration applies to all operations
- **Payment type required**: When enabled, a payment type must be selected
- **Remote payment excluded**: Remote payment types are not available for selection
- **Last cycle tracking**: System tracks the last closed cycle to prevent duplicate closures
- **Print on close**: When enabled, receipts are automatically printed when checks are closed
- **When disabled**: No automatic check closing occurs regardless of other settings

## Permissions

- **Login required**: Auto check close settings can't be configured without login
- **Permissions**: Any users with **Auto check close** permission can access and modify auto check close settings
- **Global impact**: Changes affect all automatic check closing operations

## Fields

### Enabled
- **Purpose**: Turn the automatic check close feature on or off
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Auto check close is active
  - Off (unchecked) - Auto check close is disabled
- **Default**: Off (false)
- **Behavior**: When disabled, no automatic check closing occurs

### Payment Type
- **Purpose**: Select the payment method to use when automatically closing checks
- **Type**: Dropdown selection
- **Options**: All available payment types except remote payment types
- **Display**: Shows payment type name
- **Default**: None
- **Validation**: Required when feature is enabled
- **Behavior**: Disabled when feature is disabled

### Print on Close
- **Purpose**: Automatically print receipts when checks are automatically closed
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Receipts are printed on auto-close
  - Off (unchecked) - No receipt printing on auto-close
- **Default**: Off (false)
- **Behavior**: When enabled, receipts are automatically printed for each closed check

## Edge Cases

- **No payment types available**: If no payment types exist, dropdown will be empty and feature cannot be enabled
- **Payment type deletion**: If selected payment type is deleted, setting becomes invalid
- **All payment types remote**: If all payment types are remote, dropdown will be empty
- **Last cycle tracking**: If last cycle tracking is lost, duplicate closures may occur
- **Printer issues**: If print on close is enabled but printer is unavailable, printing will fail
- **Concurrent closures**: If multiple users trigger auto-close simultaneously, conflicts may occur

## Configuration

Settings are stored in the database with the following structure:

- **Key**: `auto_check_close`
- **Is Global**: `true` (applies to all operations)
- **Values**: Object containing:
  - **enabled**: Boolean (true or false)
  - **payment_type_id**: Payment type record ID (required when enabled)
  - **print_on_close**: Boolean (true or false)
  - **last_closed_cycle**: String or timestamp (tracks last closed cycle)

## Payment Type Filtering

The payment type dropdown excludes:
- **Remote payment types**: Payment types marked as "remote" are not available
- **Inactive payment types**: Only active payment types appear in the dropdown
- **Deleted payment types**: Deleted payment types are not shown

## Known Limitations

- **Single payment type**: Only one payment type can be selected for auto-close
- **No partial closure**: Cannot configure partial check closing (e.g., close only checks under certain amount)
- **No conditional closing**: Cannot set conditions for which checks are auto-closed
- **No user notification**: No notification when checks are automatically closed
- **No closure preview**: Cannot preview which checks will be closed before auto-close runs
- **No manual override**: Cannot manually trigger auto-close outside of the closing cycle
- **No closure history**: No history of which checks were auto-closed and when

## Future Extension Points

- **Multiple payment types**: Support for multiple payment types or payment type rules
- **Conditional closing**: Configure conditions for which checks are auto-closed (e.g., only checks under $100)
- **Partial closure**: Configure partial check closing (e.g., close only specific order types)
- **User notification**: Send notifications when checks are automatically closed
- **Closure preview**: Preview which checks will be closed before auto-close runs
- **Manual trigger**: Allow manual triggering of auto-close outside of closing cycle
- **Closure history**: Maintain history of auto-closed checks with timestamps
- **Closure rules**: Configure complex rules for auto-close behavior
- **Per-user settings**: Allow different auto-close settings for different users or roles
- **Closure confirmation**: Require confirmation before auto-closing checks
