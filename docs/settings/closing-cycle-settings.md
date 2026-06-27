# Closing Cycle Settings

## Purpose

Configure the daily closing cycle time window for the restaurant POS system. This defines the time period during which the system considers a business day to end and a new day to begin, which is important for reporting, shift management, and daily operations.

## Features

- **Enable/disable**: Turn the closing cycle feature on or off
- **Time window configuration**: Set start and end times for the closing cycle
- **Cross-midnight support**: Handle closing cycles that span across midnight
- **Global configuration**: Settings apply to all users and operations
- **Default values**: Sensible defaults provided for easy setup

## User Workflow

1. Navigate to Settings page (`/settings`)
2. Locate the Closing Cycle Settings card
3. Toggle the "Enabled" switch to turn the feature on or off
4. Set the "Start Time" using the time picker (default: 06:00)
5. Set the "End Time" using the time picker (default: 02:00)
6. Click the "Save" button
7. Wait for confirmation message
8. Closing cycle is now configured with the specified time window

## Business Rules

- **Global setting**: Closing cycle configuration applies to all users
- **Time format**: Times are in 24-hour format (HH:MM)
- **Cross-midnight handling**: End time can be earlier than start time to indicate crossing midnight
- **Default values**: Default cycle is 06:00 to 02:00 (6 AM to 2 AM next day)
- **When disabled**: Closing cycle feature is turned off; no time-based closing operations occur
- **When enabled**: System uses the configured time window for closing operations

## Permissions

- **No login required**: Closing cycle settings can be configured without login
- **No special permissions**: All users can access and modify closing cycle settings
- **Global impact**: Changes affect all closing operations immediately

## Fields

### Enabled
- **Purpose**: Turn the closing cycle feature on or off
- **Type**: Toggle switch
- **Options**: 
  - On (checked) - Closing cycle is active
  - Off (unchecked) - Closing cycle is disabled
- **Default**: On (true)
- **Behavior**: When disabled, no closing cycle operations occur regardless of time settings

### Start Time
- **Purpose**: Set the beginning time of the closing cycle
- **Type**: Time input (24-hour format)
- **Format**: HH:MM (e.g., 06:00 for 6 AM, 18:00 for 6 PM)
- **Default**: 06:00
- **Behavior**: Defines when the closing cycle begins each day

### End Time
- **Purpose**: Set the ending time of the closing cycle
- **Type**: Time input (24-hour format)
- **Format**: HH:MM (e.g., 02:00 for 2 AM, 23:00 for 11 PM)
- **Default**: 02:00
- **Behavior**: Defines when the closing cycle ends
- **Cross-midnight**: If end time is earlier than start time, it indicates the cycle crosses midnight

## Edge Cases

- **Invalid time ranges**: System does not validate that end time is after start time
- **Same start and end time**: May result in zero-duration or 24-hour cycles
- **Cross-midnight confusion**: Users may not understand that end time earlier than start time means crossing midnight
- **Time zone changes**: System does not handle time zone changes automatically
- **Daylight saving time**: Time changes may affect cycle timing
- **Disabled state**: When disabled, time settings are ignored but still saved

## Configuration

Settings are stored in the database with the following structure:

- **Key**: `closing_cycle`
- **Is Global**: `true` (applies to all operations)
- **Values**: Object containing:
  - **enabled**: Boolean (true or false)
  - **start_time**: String in HH:MM format
  - **end_time**: String in HH:MM format

## Time Window Examples

### Standard Day Cycle
- **Start Time**: 06:00 (6 AM)
- **End Time**: 23:00 (11 PM)
- **Duration**: 17 hours
- **Behavior**: Closing cycle runs from 6 AM to 11 PM same day

### Cross-Midnight Cycle (Default)
- **Start Time**: 06:00 (6 AM)
- **End Time**: 02:00 (2 AM)
- **Duration**: 20 hours
- **Behavior**: Closing cycle runs from 6 AM to 2 AM next day

### 24-Hour Cycle
- **Start Time**: 00:00 (midnight)
- **End Time**: 23:59 (11:59 PM)
- **Duration**: 24 hours
- **Behavior**: Closing cycle covers entire day

## Known Limitations

- **Single cycle**: Only one closing cycle can be configured per day
- **No multiple cycles**: Cannot configure multiple closing cycles in a single day
- **No per-day configuration**: Cannot have different cycles for different days of the week
- **No validation**: System does not validate time range logic
- **No time zone support**: All times are in local time; no time zone configuration
- **No automatic adjustment**: Does not automatically adjust for daylight saving time

## Future Extension Points

- **Multiple cycles**: Support for multiple closing cycles per day
- **Per-day configuration**: Different cycles for different days of the week
- **Time zone support**: Configure time zone and handle time zone changes
- **Daylight saving time**: Automatic adjustment for daylight saving time changes
- **Cycle templates**: Pre-defined cycle templates for common scenarios
- **Validation**: Add validation for time range logic
- **Cycle duration display**: Show calculated cycle duration
- **Preview**: Visual preview of the cycle on a timeline
- **Holiday exceptions**: Special cycles for holidays or special events
