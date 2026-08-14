# POSR Documentation structure

Generated from `docs-automation/guide-catalog.mjs` (edit the catalog, not this file by hand).

```
POSR Documentation
│
├── 📘 Employee Guide
│   ├── Login
│   ├── Menu and order taking
│   ├── Cart
│   ├── Payment screen
│   ├── Orders
│   ├── Session lock, logout, and clock
│   ├── Settings
│   ├── Tables and dine-in
│   └── Security re-authentication
│
├── 📗 Manager Guide
│   ├── Summary
│   ├── Kitchen
│   ├── Order display
│   ├── Delivery
│   ├── Closing
│   ├── Reports (operations)
│   └── Tip oversight
│
├── 📙 Inventory Guide
│   ├── Inventory overview
│   ├── Items and stock master data
│   ├── Purchases
│   ├── Issues and returns
│   ├── Wastes
│   ├── Stock counts and transfers
│   ├── Kitchen reconciliation
│   ├── Recipes & production
│   └── Buffet menus & sessions
│
├── 📕 Accounts Guide
│   ├── Accounts overview
│   ├── Journal entries and account groups
│   └── Ledgers, P&L, and cash flow
│
├── 📒 HR Guide
│   ├── HR overview
│   ├── Employees
│   ├── Cost centers
│   ├── Attendance
│   ├── Leave
│   ├── Pay profiles & rules
│   ├── Payroll periods & runs
│   ├── Employee documents
│   ├── Performance notes
│   └── Tip distribution
│
└── 📓 Administrator Guide
    ├── Manage overview
    ├── Menus, categories, and dishes
    ├── Floors and tables
    ├── Discounts and coupons
    ├── Kitchens and workflows
    ├── Printers and print settings
    ├── Payment types, taxes, and order types
    ├── Users and roles
    ├── Reports hub (administrator packs)
    ├── Integrations
    └── Advanced device settings
```

## Build output

| Path | Description |
|------|-------------|
| `dist/{lang}/index.html` | Documentation hub |
| `dist/{lang}/{guide}/user-guide.html` | Role guide HTML |
| `dist/{lang}/{guide}/posr-*-guide.pdf` | Role guide PDF |
