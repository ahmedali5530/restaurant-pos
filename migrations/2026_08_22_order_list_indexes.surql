-- Indexes for Orders screen list filters (status, date range, floor, user).
DEFINE INDEX IF NOT EXISTS order_status ON order FIELDS status;
DEFINE INDEX IF NOT EXISTS order_created_at ON order FIELDS created_at;
DEFINE INDEX IF NOT EXISTS order_floor ON order FIELDS floor;
DEFINE INDEX IF NOT EXISTS order_user ON order FIELDS user;
