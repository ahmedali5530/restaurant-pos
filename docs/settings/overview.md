# Settings Module Overview

## Purpose

The Settings module provides comprehensive configuration options for the restaurant POS application, allowing administrators and users to customize system behavior, printing, language, delivery services, and various operational parameters.

## Navigation

The Settings module is accessible through two main URLs:

- **Main Settings**: `/settings` - General application settings
- **Delivery Settings**: `/delivery/settings` - Delivery-specific configuration

## Module Organization

### Main Settings (`/settings`)

The main settings page is organized into a grid layout with the following configuration cards:

1. **Printer Settings** - Configure printers for different receipt types
2. **Language Settings** - Set application language and text direction
3. **Cache Settings** - Manage application data cache
4. **Menu Settings** - Activate/deactivate menus
5. **Service Charges Settings** - Configure automatic service charges
6. **Closing Cycle Settings** - Set daily closing cycle time window
7. **Auto Check Close Settings** - Configure automatic check closing
8. **Touch Settings** - Toggle touch-optimized interface
9. **Table Selection Settings** - Show/hide table selection interface
10. **Items Visibility Settings** - Configure item display options

### Delivery Settings (`/delivery/settings`)

The delivery settings page provides comprehensive delivery service configuration:

- Enable/disable delivery service
- Configure delivery charges and minimum order amounts
- Set delivery timing schedules (daily and custom dates)
- Select delivery menu
- Configure map center coordinates for delivery zones
- Manage delivery banners

## User Workflow

1. Navigate to the desired settings page
2. Modify configuration options as needed
3. Save changes (most settings require explicit save action)
4. Changes take effect immediately or on next page refresh

## Business Rules

- **User-specific vs Global**: Some settings are user-specific (printer settings) while others are global (menus, service charges)
- **Login Requirements**: Certain settings require user login to save
- **Validation**: Settings with numeric or time values include validation
- **Default Values**: Most settings have sensible default values

## Permissions

- Most settings are accessible to all logged-in users
- Some settings have no permission requirements (language, touch interface)
- Security protections are applied to form submissions

## Configuration

Settings are stored in the database with the following structure:

- **Key**: Unique identifier for each setting
- **Values**: Configuration data (varies by setting type)
- **Is Global**: Flag indicating if setting applies to all users
- **User**: Associated user for user-specific settings

## Known Limitations

- Printer settings do not support printer-specific formatting
- Only one delivery menu can be selected
- No zone-based delivery pricing
- Single closing cycle per day
- Limited to supported languages (9 languages)

## Future Extension Points

- Printer-specific receipt formatting
- Conditional service charges based on order type or time
- Multiple delivery zones with dynamic pricing
- User-specific menu selection
- Time-based menu activation
- Custom language support
- Per-device touch settings
