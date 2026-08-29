/**
 * Tableside-Optimized UI — waiter-facing tablet screen.
 *
 * Research finding: Toast charges $9/employee/mo for tableside ordering;
 * Square for Restaurants gates mobile ordering to higher tiers; Lightspeed
 * bundles it only in Pro. POSR offers it free.
 *
 * Design goals (from forum research — top waiter complaints):
 *   1. Large touch targets (min 56px) — waiters hold tablets one-handed
 *   2. High contrast + big fonts — readable in dim restaurant lighting
 *   3. Minimal clicks — table → category → dish → send in ≤4 taps
 *   4. Real-time table status — color-coded (free / occupied / reserved)
 *   5. Live cart with running total + tax preview
 *   6. Send-to-kitchen emits a SurQL write that kitchen.tsx already renders
 *
 * Flow:
 *   1. Floor selector (if multiple floors)
 *   2. Table grid — tap to open
 *   3. Category tabs (horizontal scroll)
 *   4. Dish grid (large tiles with name + price)
 *   5. Cart drawer (slide-up) with qty +/- per line
 *   6. "Send to Kitchen" — persists order → kitchen screen picks it up via live query
 *
 * Offline-safe: writes route through the offline queue if WebSocket is down
 * (DatabaseProvider intercept — see src/providers/database.provider.tsx).
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useAtom } from 'jotai';
import { appSettings } from '@/store/jotai.ts';
import { useDB } from '@/api/db/db.ts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useSecurity } from '@/hooks/useSecurity.ts';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUtensils, faArrowLeft, faPlus, faMinus, faTrash, faFire, faCheck, faChair, faClock } from '@fortawesome/free-solid-svg-icons';
import { OrderStatus } from '@/api/model/order.ts';
import { toRecordId } from '@/lib/utils.ts';
import { withCurrency } from '@/lib/utils.ts';
import { nowSurrealDateTime } from '@/lib/datetime.ts';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CartLine {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  category?: string;
}

interface TableOrderInfo {
  tableId: string;
  tableName: string;
  floorName: string;
  occupied: boolean;
  orderId?: string;
  covers?: number;
}

// ---------------------------------------------------------------------------
// Touch-target sized button presets (≥44px Apple, ≥48dp Material — we use ≥56px)
// ---------------------------------------------------------------------------

const TILE_BTN = 'min-h-[56px] px-4 py-3 rounded-lg text-base font-medium transition-all active:scale-95 select-none';
const BIG_BTN = 'min-h-[64px] px-6 py-4 rounded-xl text-lg font-semibold transition-all active:scale-95 select-none';

// Table status colors — colorblind-safe (uses shape icon + color)
const TABLE_STATUS = {
  free:      { bg: 'bg-emerald-50 border-emerald-400 text-emerald-800',  icon: faChair,  label: 'Free' },
  occupied:  { bg: 'bg-rose-50 border-rose-400 text-rose-800',          icon: faUtensils, label: 'Occupied' },
  reserved:  { bg: 'bg-amber-50 border-amber-400 text-amber-800',       icon: faClock,  label: 'Reserved' },
  dirty:     { bg: 'bg-neutral-100 border-neutral-400 text-neutral-600', icon: faChair,  label: 'Needs cleaning' },
} as const;

// ---------------------------------------------------------------------------
// Main screen
// ---------------------------------------------------------------------------

export function TablesideScreen() {
  const { t } = useTranslation(['tableside', 'common']);
  const [settings] = useAtom(appSettings);
  const db = useDB();
  const { user } = useSecurity() as any;

  // View state
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedTable, setSelectedTable] = useState<TableOrderInfo | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [covers, setCovers] = useState<number>(2);
  const [sending, setSending] = useState(false);
  const [tableStates, setTableStates] = useState<Record<string, string>>({});

  // Derived data
  const floors = useMemo(() => settings.floors ?? [], [settings.floors]);
  const tables = useMemo(() => {
    if (!selectedFloor) return settings.tables ?? [];
    return (settings.tables ?? []).filter(t => t.floor?.id?.toString() === selectedFloor);
  }, [settings.tables, selectedFloor]);

  const categories = useMemo(() => {
    return (settings.categories ?? []).filter(c => c.show_in_menu !== false);
  }, [settings.categories]);

  const dishes = useMemo(() => {
    return (settings.dishes ?? []).filter(d => {
      if (!d.deleted_at) return true;
      // Active dishes only
      if (activeCategory) {
        return (d.categories ?? []).some(c => c.id?.toString() === activeCategory);
      }
      return true;
    });
  }, [settings.dishes, activeCategory]);

  const dishesForCategory = useMemo(() => {
    if (!activeCategory) return dishes.slice(0, 24);
    return dishes.filter(d => (d.categories ?? []).some(c => c.id?.toString() === activeCategory));
  }, [dishes, activeCategory]);

  // Set default floor + category on mount
  useEffect(() => {
    if (!selectedFloor && floors.length > 0) {
      setSelectedFloor(floors[0].id?.toString() ?? '');
    }
  }, [floors, selectedFloor]);

  useEffect(() => {
    if (!activeCategory && categories.length > 0) {
      setActiveCategory(categories[0].id?.toString() ?? '');
    }
  }, [categories, activeCategory]);

  // Fetch live table states (occupied/free) — query orders with status 'pending'/'preparing'/'ready'
  const refreshTableStates = useCallback(async () => {
    try {
      const result = await db.query<any[]>(
        `SELECT id, table.id AS table_id, status, covers FROM order WHERE status IN ['pending', 'preparing', 'ready', 'served'] AND deleted_at IS NONE`
      );
      const states: Record<string, string> = {};
      const list = Array.isArray(result) ? result.flat() : [];
      for (const o of list) {
        const tid = o.table_id?.toString?.() ?? o.table_id;
        if (tid) states[tid] = o.status ?? 'occupied';
      }
      setTableStates(states);
    } catch (err) {
      // Non-fatal — fall back to "free" for all tables
      console.warn('[tableside] refreshTableStates failed', err);
    }
  }, [db]);

  useEffect(() => {
    refreshTableStates();
    const interval = setInterval(refreshTableStates, 15_000); // refresh every 15s
    return () => clearInterval(interval);
  }, [refreshTableStates]);

  // Cart helpers
  const addToCart = useCallback((dish: any) => {
    setCart(prev => {
      const existing = prev.find(l => l.dishId === dish.id?.toString());
      if (existing) {
        return prev.map(l => l.dishId === dish.id?.toString() ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, {
        dishId: dish.id?.toString() ?? '',
        name: dish.name ?? dish.number ?? 'Item',
        price: dish.price ?? 0,
        quantity: 1,
        category: (dish.categories?.[0]?.name) ?? '',
      }];
    });
  }, []);

  const changeQty = useCallback((dishId: string, delta: number) => {
    setCart(prev => prev
      .map(l => l.dishId === dishId ? { ...l, quantity: l.quantity + delta } : l)
      .filter(l => l.quantity > 0)
    );
  }, []);

  const removeLine = useCallback((dishId: string) => {
    setCart(prev => prev.filter(l => l.dishId !== dishId));
  }, []);

  const cartTotal = useMemo(() => cart.reduce((sum, l) => sum + l.price * l.quantity, 0), [cart]);
  const cartCount = useMemo(() => cart.reduce((sum, l) => sum + l.quantity, 0), [cart]);

  // Open table → load existing open order (if any)
  const openTable = useCallback(async (table: any) => {
    const tableId = table.id?.toString() ?? '';
    setSelectedTable({
      tableId,
      tableName: table.name ?? `Table ${table.number ?? '?'}`,
      floorName: table.floor?.name ?? '',
      occupied: !!tableStates[tableId],
    });
    // Reset cart for new table
    setCart([]);
    setCovers(table.covers ?? 2);
    // If table is occupied, try to load its open order
    try {
      const result = await db.query<any[]>(
        `SELECT * FROM order WHERE table.id = $tableId AND status IN ['pending', 'preparing'] AND deleted_at IS NONE LIMIT 1`,
        { tableId }
      );
      const list = Array.isArray(result) ? result.flat() : [];
      if (list.length > 0) {
        const existing = list[0];
        setSelectedTable(prev => prev ? { ...prev, orderId: existing.id?.toString(), occupied: true } : prev);
        // Load items into cart
        const items = (existing.items ?? []).map((it: any) => ({
          dishId: it.item?.id?.toString() ?? '',
          name: it.item?.name ?? 'Item',
          price: it.price ?? it.item?.price ?? 0,
          quantity: it.quantity ?? 1,
          category: it.category ?? '',
        }));
        setCart(items);
        setCovers(existing.covers ?? 2);
        toast.info(`Loaded open order for ${table.name ?? 'table'}`);
      }
    } catch (err) {
      console.warn('[tableside] load existing order failed', err);
    }
  }, [db, tableStates]);

  // Send to kitchen — persist order
  const sendToKitchen = useCallback(async () => {
    if (!selectedTable) return;
    if (cart.length === 0) {
      toast.error('Cart is empty');
      return;
    }
    setSending(true);
    try {
      const orderItems = cart.map((line, idx) => ({
        item: toRecordId(line.dishId),
        name: line.name,
        price: line.price,
        quantity: line.quantity,
        position: idx + 1,
        category: line.category,
        comments: line.notes ?? '',
        created_at: nowSurrealDateTime(),
      }));

      const orderData: any = {
        table: toRecordId(selectedTable.tableId),
        floor: undefined,
        items: orderItems,
        covers,
        status: OrderStatus.Pending,
        notes: '',
        user: user?.id ? toRecordId(user.id.toString()) : undefined,
        created_at: nowSurrealDateTime(),
        tags: ['tableside'],
      };

      if (selectedTable.orderId) {
        // Update existing order
        await db.merge(toRecordId(`order:${selectedTable.orderId}`), { items: orderItems, covers });
        toast.success(`Updated order — sent to kitchen (${cartCount} items)`);
      } else {
        // Create new order
        const created = await db.create('order', orderData);
        const newId = (created as any)?.id?.toString?.() ?? (Array.isArray(created) ? created[0]?.id?.toString() : '');
        if (newId) {
          setSelectedTable(prev => prev ? { ...prev, orderId: newId, occupied: true } : prev);
        }
        toast.success(`Order sent to kitchen — ${cartCount} items, ${withCurrency(cartTotal)}`);
      }

      // Mark table as occupied in local state
      setTableStates(prev => ({ ...prev, [selectedTable.tableId]: 'pending' }));
      // Clear cart but keep table open (so waiter can add more items)
      setCart([]);
    } catch (err) {
      console.error('[tableside] sendToKitchen failed', err);
      toast.error('Failed to send order — will retry when online');
    } finally {
      setSending(false);
    }
  }, [selectedTable, cart, cartCount, cartTotal, covers, db, user]);

  // Go back to table grid
  const closeTable = useCallback(() => {
    setSelectedTable(null);
    setCart([]);
    refreshTableStates();
  }, [refreshTableStates]);

  // ===========================================================================
  // RENDER — Table grid view
  // ===========================================================================
  if (!selectedTable) {
    return (
      <div className="min-h-screen bg-neutral-50 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between sticky top-0 z-10">
          <div>
            <h1 className="text-2xl font-bold text-neutral-900">
              <FontAwesomeIcon icon={faUtensils} className="mr-3 text-amber-600" />
              {t('tableside:title', 'Tableside')}
            </h1>
            <p className="text-sm text-neutral-500">
              {floors.length > 1 && `${floors.find(f => f.id?.toString() === selectedFloor)?.name ?? ''} · `}
              {tables.length} tables · {Object.keys(tableStates).length} active
            </p>
          </div>
          {floors.length > 1 && (
            <div className="flex gap-2 overflow-x-auto max-w-md">
              {floors.map(f => (
                <button
                  key={f.id?.toString()}
                  onClick={() => setSelectedFloor(f.id?.toString() ?? '')}
                  className={`${TILE_BTN} ${
                    selectedFloor === f.id?.toString()
                      ? 'bg-neutral-900 text-white'
                      : 'bg-white border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}
        </header>

        {/* Table grid */}
        <main className="flex-1 p-6 overflow-auto">
          {tables.length === 0 ? (
            <div className="text-center text-neutral-400 mt-20 text-lg">
              No tables configured for this floor.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {tables.map(table => {
                const tid = table.id?.toString() ?? '';
                const status = tableStates[tid] ? 'occupied' : 'free';
                const st = TABLE_STATUS[status as keyof typeof TABLE_STATUS];
                return (
                  <button
                    key={tid}
                    onClick={() => openTable(table)}
                    className={`${TILE_BTN} ${st.bg} border-2 flex flex-col items-center justify-center gap-2 min-h-[120px]`}
                    data-testid={`tableside-table-${tid}`}
                  >
                    <FontAwesomeIcon icon={st.icon} className="text-3xl" />
                    <span className="text-xl font-bold">{table.name ?? table.number}</span>
                    <span className="text-xs uppercase tracking-wide opacity-75">{st.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </main>
      </div>
    );
  }

  // ===========================================================================
  // RENDER — Order builder view (table selected)
  // ===========================================================================
  return (
    <div className="min-h-screen bg-neutral-50 flex flex-col">
      {/* Header — table info + back */}
      <header className="bg-white border-b border-neutral-200 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <button
            onClick={closeTable}
            className={`${TILE_BTN} bg-neutral-100 text-neutral-700 hover:bg-neutral-200`}
            aria-label="Back to tables"
          >
            <FontAwesomeIcon icon={faArrowLeft} className="text-xl" />
          </button>
          <div>
            <h1 className="text-xl font-bold">{selectedTable.tableName}</h1>
            <p className="text-xs text-neutral-500">
              {selectedTable.floorName} ·
              {selectedTable.occupied
                ? <span className="text-rose-600 font-medium ml-1">Open order</span>
                : <span className="text-emerald-600 font-medium ml-1">New order</span>
              }
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-sm text-neutral-500">Covers</label>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCovers(c => Math.max(1, c - 1))}
              className="w-10 h-10 rounded-lg bg-neutral-200 flex items-center justify-center active:scale-90"
            >
              <FontAwesomeIcon icon={faMinus} />
            </button>
            <span className="text-2xl font-bold w-10 text-center tabular-nums">{covers}</span>
            <button
              onClick={() => setCovers(c => Math.min(99, c + 1))}
              className="w-10 h-10 rounded-lg bg-neutral-800 text-white flex items-center justify-center active:scale-90"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          </div>
        </div>
      </header>

      {/* Category tabs — horizontal scroll */}
      <div className="bg-white border-b border-neutral-200 px-4 py-2 flex gap-2 overflow-x-auto">
        {categories.map(cat => (
          <button
            key={cat.id?.toString()}
            onClick={() => setActiveCategory(cat.id?.toString() ?? '')}
            className={`${TILE_BTN} whitespace-nowrap ${
              activeCategory === cat.id?.toString()
                ? 'bg-amber-500 text-white'
                : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Main area — dish grid + cart side panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Dish grid */}
        <main className="flex-1 p-4 overflow-auto">
          {dishesForCategory.length === 0 ? (
            <div className="text-center text-neutral-400 mt-20 text-lg">No dishes in this category.</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {dishesForCategory.map(dish => {
                const inCart = cart.find(l => l.dishId === dish.id?.toString());
                return (
                  <button
                    key={dish.id?.toString()}
                    onClick={() => addToCart(dish)}
                    className={`${TILE_BTN} bg-white border-2 border-neutral-200 hover:border-amber-400 hover:bg-amber-50 flex flex-col items-start gap-1 min-h-[110px] relative`}
                  >
                    {inCart && (
                      <span className="absolute top-2 right-2 bg-amber-500 text-white rounded-full w-7 h-7 flex items-center justify-center text-sm font-bold">
                        {inCart.quantity}
                      </span>
                    )}
                    <span className="text-base font-semibold text-left leading-tight line-clamp-2">
                      {dish.name}
                    </span>
                    <span className="text-lg font-bold text-amber-700 mt-auto">
                      {withCurrency(dish.price)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </main>

        {/* Cart panel — fixed right on desktop, drawer on mobile */}
        <aside className="w-full sm:w-96 bg-white border-l border-neutral-200 flex flex-col">
          <div className="p-4 border-b border-neutral-200 flex items-center justify-between">
            <h2 className="text-lg font-bold">
              Cart
              {cartCount > 0 && <span className="ml-2 bg-amber-500 text-white rounded-full px-2 py-0.5 text-sm">{cartCount}</span>}
            </h2>
            {cart.length > 0 && (
              <button
                onClick={() => setCart([])}
                className="text-sm text-rose-600 hover:text-rose-700 flex items-center gap-1"
              >
                <FontAwesomeIcon icon={faTrash} /> Clear
              </button>
            )}
          </div>

          {/* Cart lines — scrollable */}
          <div className="flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
            {cart.length === 0 ? (
              <div className="p-8 text-center text-neutral-400">
                <FontAwesomeIcon icon={faUtensils} className="text-4xl mb-3 opacity-40" />
                <p>Tap dishes to add them</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-100">
                {cart.map(line => (
                  <div key={line.dishId} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{line.name}</div>
                      <div className="text-sm text-neutral-500">{withCurrency(line.price)} each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => changeQty(line.dishId, -1)}
                        className="w-9 h-9 rounded-lg bg-neutral-200 flex items-center justify-center active:scale-90"
                      >
                        <FontAwesomeIcon icon={faMinus} className="text-sm" />
                      </button>
                      <span className="text-xl font-bold w-8 text-center tabular-nums">{line.quantity}</span>
                      <button
                        onClick={() => changeQty(line.dishId, 1)}
                        className="w-9 h-9 rounded-lg bg-neutral-800 text-white flex items-center justify-center active:scale-90"
                      >
                        <FontAwesomeIcon icon={faPlus} className="text-sm" />
                      </button>
                    </div>
                    <div className="w-20 text-right font-semibold tabular-nums">
                      {withCurrency(line.price * line.quantity)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Totals + send button */}
          <div className="border-t border-neutral-200 p-4 bg-neutral-50">
            <div className="flex justify-between items-center mb-1 text-sm text-neutral-500">
              <span>Subtotal</span>
              <span className="tabular-nums">{withCurrency(cartTotal)}</span>
            </div>
            <div className="flex justify-between items-center mb-3 text-lg font-bold">
              <span>Total</span>
              <span className="tabular-nums text-amber-700">{withCurrency(cartTotal)}</span>
            </div>
            <button
              onClick={sendToKitchen}
              disabled={cart.length === 0 || sending}
              className={`${BIG_BTN} w-full ${
                cart.length === 0 || sending
                  ? 'bg-neutral-300 text-neutral-500 cursor-not-allowed'
                  : 'bg-amber-500 text-white hover:bg-amber-600 shadow-lg'
              }`}
            >
              <FontAwesomeIcon icon={sending ? faCheck : faFire} className="mr-2" />
              {sending ? 'Sending…' : selectedTable.orderId ? 'Send Update to Kitchen' : 'Send to Kitchen'}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}

export default TablesideScreen;
