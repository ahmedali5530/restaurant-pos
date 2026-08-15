# Printers and print settings

Define printer records in Manage, configure what each print job contains, then assign printers to devices in Settings.

### Printers

Printer records store connection details used across receipt, kitchen, and report printing.

1. Open the Printers tab.
2. Add printers with name, type, and connection settings.
3. Link printers to kitchens and device Settings so tickets reach the right hardware.

![Printers master list in Manage.](images/en/admin-printers.png)

*Printers master list in Manage.*

### Print settings

Print settings control templates and options for temp bills, final receipts, kitchen tickets, summaries, and delivery slips.

1. Open the Print settings tab.
2. Edit each print type (Temp, Final, Kitchen, Summary, Delivery).
3. Save so new orders use the updated layout and fields.

![Print settings tab.](images/en/admin-print-settings.png)

*Print settings tab.*

### Printer form

1. Open Admin → Printing → Printers.
2. Add name and connection: network IP/port or USB identifiers.
3. Choose printer type (receipt, kitchen, label).
4. Save — assign in kitchens and device settings.

**Fields**

- **Name** — Friendly name in admin and device pickers.
- **Type** — Receipt, kitchen, or label driver profile.
- **IP address / port** — Network ESC/POS connection.
- **VID / PID** — USB vendor/product IDs for direct-attached printers.

![Printer form.](images/en/admin-printing-printer-form.png)

*Printer form.*

### Print setting form

Each print job type (temp bill, final receipt, kitchen, summary, delivery) has its own template.

1. Open Print settings tab and pick a job type.
2. Configure logo, header/footer sections, VAT block, and margins.
3. Toggle line columns shown on receipts.
4. Save — the next print uses the updated layout.

**Fields**

- **Show logo** — Includes uploaded logo on the ticket.
- **Header / footer sections** — Rich text or image blocks above and below the body.
- **VAT name / number** — Tax registration block on guest receipts.
- **Margins** — Top, bottom, left, right spacing in printer dots.
- **Item columns** — Toggle number, name, qty, price, and line total columns.

![Print template editor.](images/en/admin-printing-print-setting-form.png)

*Print template editor.*
