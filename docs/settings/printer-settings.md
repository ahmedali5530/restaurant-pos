# Printer Settings

## Purpose

Configure which printers are used for different types of receipts and documents in the restaurant POS system. This allows you to assign specific printers to handle temporary orders, final receipts, refunds, delivery orders, and summary reports.

## Features

- **Multi-printer support**: Assign multiple printers to each print type
- **Five print categories**: Configure printers for temp, final, refund, delivery, and summary prints
- **User-specific settings**: Each user can have their own printer configuration
- **Global fallback**: If no user-specific setting exists, uses global configuration
- **Dynamic printer list**: Automatically loads available printers from the system

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Printer Settings card
3. For each print type (temp, final, refund, delivery, summary):
   - Click the dropdown field
   - Select one or more printers from the available list
   - Repeat for each print type as needed
4. Click the "Save" button to save your configuration
5. Wait for confirmation message

## Business Rules

- **User-specific priority**: User-specific printer settings override global settings
- **Global fallback**: If no user-specific configuration exists, the system uses global settings
- **Multi-printer support**: You can select multiple printers for each print type
- **Printer availability**: Only printers configured in the system appear in the dropdown
- **Priority ordering**: Printers are displayed in priority order (as configured in printer settings)

## Permissions

- **Login required**: You must be logged in to save printer settings
- **User-specific**: Settings are saved per user, not globally
- **No special permissions**: All logged-in users can configure their printer settings

## Fields

### Temp Print Printers
- **Purpose**: Printers used for temporary order receipts (before final payment)
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected)

### Final Print Printers
- **Purpose**: Printers used for final payment receipts
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected)

### Refund Print Printers
- **Purpose**: Printers used for refund receipts
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected)

### Delivery Print Printers
- **Purpose**: Printers used for delivery order receipts
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected)

### Summary Print Printers
- **Purpose**: Printers used for summary reports and daily closing reports
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected)

## Edge Cases

- **Printer deletion**: If a configured printer is deleted from the system, it will no longer appear in the dropdown but may remain in saved settings
- **Printer name changes**: If a printer's name changes, the configuration still references the printer by ID
- **No printers available**: If no printers are configured in the system, the dropdown will be empty
- **User logout**: Settings persist after logout and are reloaded on next login
- **Network issues**: Save failures may occur during network connectivity issues

## Configuration

Settings are stored in the database with the following keys:

- `temp_print_printers` - Array of printer IDs for temp prints
- `final_print_printers` - Array of printer IDs for final prints
- `refund_print_printers` - Array of printer IDs for refund prints
- `delivery_print_printers` - Array of printer IDs for delivery prints
- `summary_print_printers` - Array of printer IDs for summary prints

Each setting contains:
- **Key**: The setting identifier
- **Values**: Array of printer IDs
- **User**: The user ID (for user-specific settings)
- **Is Global**: Boolean flag (false for user-specific, true for global)

## Known Limitations

- **No printer-specific formatting**: All printers use the same receipt format
- **No conditional printing**: Cannot configure different printers based on order type, time, or other conditions
- **No printer status checking**: System does not verify if printers are online or have paper before printing
- **No print queue management**: Cannot prioritize or reorder print jobs

## Future Extension Points

- **Printer-specific formatting**: Configure different receipt layouts per printer
- **Conditional printing**: Assign printers based on order type, payment method, or time of day
- **Printer health monitoring**: Display printer status (online/offline, paper level, ink level)
- **Print queue management**: View and manage print job queue
- **Printer groups**: Create printer groups for easier assignment
- **Fallback printers**: Configure backup printers if primary printer fails
