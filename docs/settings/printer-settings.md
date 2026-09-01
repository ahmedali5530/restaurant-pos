# Printer Settings

## Purpose

Configure which printers are used for different types of receipts and documents in the restaurant POS system. Assign printers per logged-in user, or per terminal (system printers) so shared devices print to nearby printers.

## Features

- **Multi-printer support**: Assign multiple printers to each print type
- **Five print categories (user)**: Temp, final, refund, delivery, and summary
- **System printers (this device)**: Temp, final, refund, and summary stored in the browser; ideal for shared terminals
- **Use system printers switch**: Prefer this device’s assignments over the logged-in user’s (except delivery)
- **User-specific settings**: Each user can have their own printer configuration in the database
- **Global fallback**: If no user-specific setting exists (and system printers are off), uses global configuration
- **Dynamic printer list**: Automatically loads available printers from the system

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Printer Settings card
3. Optionally enable **Use system printers on this device**
4. Under **System printers**, select printers for temp, final, refund, and summary (saved immediately in this browser)
5. Under **User printers**, for each print type (including delivery):
   - Click the dropdown field
   - Select one or more printers from the available list
6. Click **Save printer settings** to save user assignments to the database
7. Wait for confirmation message

## Business Rules

- **System printers priority**: When the switch is on, temp/final/refund/summary use this browser’s system assignments (no user/global fallback if empty)
- **Delivery always user/global**: Delivery print is never terminal-scoped; it always resolves user setting then global
- **User-specific priority**: When system printers are off, user-specific settings override global settings
- **Global fallback**: If no user-specific configuration exists (and system mode is off), the system uses global settings
- **Multi-printer support**: You can select multiple printers for each print type
- **Printer availability**: Only printers configured in the system appear in the dropdown
- **Priority ordering**: Printers are displayed in priority order (as configured in printer settings)

## Permissions

- **Login required**: You must be logged in to save **user** printer settings
- **System printers**: Stored in the browser; no login required to change them
- **User-specific**: User settings are saved per user, not globally
- **No special permissions**: All logged-in users can configure their printer settings

## Fields

### Use system printers
- **Purpose**: Route temp/final/refund/summary prints through this device’s system assignments
- **Type**: Switch
- **Storage**: Browser (`localStorage` via jotai)

### System printers (temp, final, refund, summary)
- **Purpose**: Terminal-scoped printer routing for shared POS browsers
- **Type**: Multi-select dropdowns
- **Storage**: Browser only
- **Not included**: Delivery

### Temp / Final / Refund / Delivery / Summary (user)
- **Purpose**: Per-user printer routing (delivery always uses this path)
- **Type**: Multi-select dropdown
- **Options**: All available printers in the system
- **Default**: None (no printers selected); falls back to global when unset

## Edge Cases

- **Printer deletion**: If a configured printer is deleted from the system, it will no longer appear in the dropdown but may remain in saved settings
- **Printer name changes**: If a printer's name changes, the configuration still references the printer by ID
- **No printers available**: If no printers are configured in the system, the dropdown will be empty
- **Empty system list with switch on**: No printers are used for that print type (does not fall back to user/global)
- **User logout**: User settings persist in the database; system printers remain on the device
- **Network issues**: Save failures may occur during network connectivity issues for user settings

## Configuration

### User / global (database `setting` rows)

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

### System (browser)

Stored under jotai key `system-printers`:
- `useSystemPrinters` - boolean
- `temp_print_printers`, `final_print_printers`, `refund_print_printers`, `summary_print_printers` - string arrays of printer IDs

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
