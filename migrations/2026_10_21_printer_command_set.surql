-- Printer wire protocol. Empty/null = ESC/POS.
-- `star-graphic` is required for Star TSP100-class printers, which discard ESC/POS text.

DEFINE FIELD IF NOT EXISTS command_set ON printer TYPE option<string|null> PERMISSIONS FULL;
