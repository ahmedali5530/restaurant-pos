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
│   ├── Tables and dine-in (deep dive) [planned]
│   └── Security re-authentication [planned]
│
├── 📗 Manager Guide
│   ├── Summary [planned]
│   ├── Kitchen [planned]
│   ├── Order display [planned]
│   ├── Delivery [planned]
│   ├── Closing [planned]
│   ├── Reports (operations) [planned]
│   └── Tip oversight [planned]
│
├── 📙 Inventory Guide
│   ├── Inventory overview [planned]
│   ├── Items and stock [planned]
│   ├── Purchases [planned]
│   ├── Issues and returns [planned]
│   ├── Wastes [planned]
│   └── Stock counts [planned]
│
├── 📕 Accounts Guide
│   ├── Accounts overview [planned]
│   ├── Expenses [planned]
│   └── Ledgers and balances [planned]
│
├── 📒 HR Guide
│   ├── HR overview [planned]
│   ├── Employees [planned]
│   ├── Attendance [planned]
│   ├── Leave [planned]
│   └── Tip distribution [planned]
│
└── 📓 Administrator Guide
    ├── Manage overview [planned]
    ├── Menus, categories, dishes [planned]
    ├── Floors and tables [planned]
    ├── Users and roles [planned]
    ├── Payment types and taxes [planned]
    ├── Integrations [planned]
    ├── Advanced device settings [planned]
    └── Reports hub [planned]
```

## Build output

| Path | Description |
|------|-------------|
| `dist/{lang}/index.html` | Documentation hub |
| `dist/{lang}/{guide}/user-guide.html` | Role guide HTML |
| `dist/{lang}/{guide}/posr-*-guide.pdf` | Role guide PDF |
