# Language Settings

## Purpose

Configure the application language and text direction to accommodate users from different regions and language preferences. This setting controls the language of all interface elements, labels, buttons, and messages throughout the application.

## Features

- **Multi-language support**: 9 supported languages including English, Arabic, German, Spanish, French, Italian, Dutch, Portuguese (Brazil), Russian, and Turkish
- **Automatic text direction**: Automatically switches between left-to-right (LTR) and right-to-left (RTL) based on language selection
- **Instant application**: Language changes take effect immediately without page refresh
- **Session-based**: Language preference is maintained during the current session

## User Workflow

### Language Selection

1. Navigate to Settings page (`/settings`)
2. Locate the Language Settings card
3. View the list of available languages displayed as buttons
4. Click on the desired language button
5. The application immediately updates to the selected language
6. The selected language button appears highlighted/active

### Text Direction Selection

1. In the same Language Settings card, locate the Text Direction section
2. View the available text direction options (LTR, RTL)
3. Click on the desired text direction button
4. The application immediately updates the text direction
5. The selected direction button appears highlighted/active

## Business Rules

- **Arabic auto-RTL**: When Arabic is selected, text direction automatically switches to RTL
- **Non-Arabic languages**: All other languages default to LTR text direction
- **Manual override**: Text direction can be manually changed independent of language selection
- **Session persistence**: Language and direction settings persist during the current browser session
- **No database storage**: Settings are not permanently saved to the database

## Permissions

- **No login required**: Language settings can be changed by any user, including guests
- **No special permissions**: All users have access to language configuration
- **Session-based only**: Settings reset to default when session ends or browser is closed

## Fields

### Language Selection
- **Purpose**: Select the primary language for the application interface
- **Type**: Button selection (single choice)
- **Options**:
  - English (en)
  - Arabic (ar)
  - German (de)
  - Spanish (es)
  - French (fr)
  - Italian (it)
  - Dutch (nl)
  - Portuguese - Brazil (pt-br)
  - Russian (ru)
  - Turkish (tr)
- **Default**: English
- **Behavior**: Instant application, no save button required

### Text Direction
- **Purpose**: Configure the reading direction of text in the application
- **Type**: Button selection (single choice)
- **Options**:
  - Left-to-Right (LTR)
  - Right-to-Left (RTL)
- **Default**: Left-to-Right (LTR)
- **Behavior**: Instant application, no save button required

## Edge Cases

- **Missing translations**: If a specific text element is not translated in the selected language, it may display in English or the original text
- **Language file corruption**: If a language file is corrupted or missing, the application may fall back to English
- **RTL layout issues**: Some interface elements may not display correctly in RTL mode for certain languages
- **Session expiration**: Language preference is lost when the browser session ends or cache is cleared
- **Mixed content**: User-generated content (e.g., menu item names) may not be translated and will display in the original language

## Configuration

Settings are stored in the application state (Jotai atom):

- **Language**: Language code (e.g., 'en', 'ar', 'de')
- **Direction**: Text direction code ('ltr' or 'rtl')

These settings are:
- **Session-based**: Stored in browser memory during the session
- **Not persistent**: Not saved to database or local storage
- **Global**: Affect the entire application interface

## Known Limitations

- **Limited language support**: Only 9 languages are supported; additional languages cannot be added without code changes
- **No user persistence**: Language preference is not saved per user; resets on each session
- **No per-module language**: Cannot set different languages for different sections of the application
- **Translation completeness**: Not all interface elements may be translated in all languages
- **No regional variants**: Only one variant per language is supported (e.g., Portuguese only has Brazilian variant)

## Future Extension Points

- **User language persistence**: Save language preference per user in the database
- **Additional languages**: Support for more languages and regional variants
- **Custom language support**: Allow users to upload custom translation files
- **Per-module language**: Configure different languages for different sections (e.g., kitchen display in one language, customer display in another)
- **Translation management**: Interface for administrators to manage and edit translations
- **Auto-detection**: Automatically detect browser language and set accordingly
- **Language fallback**: Configure fallback language chain for missing translations
