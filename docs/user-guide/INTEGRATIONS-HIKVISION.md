# Hikvision Attendance Integration

Connect Hikvision access / attendance terminals to POSR Labor so punches become time entries and HR employees stay in sync on the device.

## Requirements

- API server can reach each terminal (same LAN, VPN, or public IP with port forwarding).
- Device ISAPI enabled with a user that can read AcsEvent and manage UserInfo.
- Employees in HR have `employee_number` matching the terminal person number (`employeeNo`).
- Linked POS user on the employee is required to open/close time entries from device punches.

## Setup

1. Open **Integrations** and enable **Hikvision Attendance**.
2. Configuration → **Devices** — add one or more terminals with name, host/IP, port, HTTPS, username, and password.

For cloud POS with a local device, set **Host / IP** to the public IP/domain and the forwarded **Port** (enable **Use HTTPS** if applicable).

3. Adjust poll interval, lookback, and auto-import / auto-sync switches.
4. Save, then use **Test connection**, **Sync events now**, and **Push all employees**.

## Behavior

- Polling runs while the provider is enabled (browser session with Integration Manager active).
- Events are stored for dedupe, then imported as `time_entry` with `source: device`.
- If the device sends `attendanceStatus` (`checkIn` / `checkOut`), that wins; otherwise odd punches are in and even are out within a calendar day.
- Creating, updating, or terminating an employee in HR pushes or deletes the person on enabled devices when auto-sync is on.

## Notes

- Face/fingerprint enrollment stays on the terminal in v1 — only person records are pushed.
- Biometric templates are not downloaded or uploaded by this integration.
