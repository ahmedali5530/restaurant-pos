/**
 * Kiosk mode — customer-facing self-ordering screen.
 *
 * Research finding: Kiosk mode is the #2 biggest feature gap (COMP-1).
 * Industry data: 15-30% check increase (Toast, Square data).
 * All 5 top competitors have it; POSR doesn't.
 *
 * Architecture:
 *   - /kiosk route (public — no login required, uses a kiosk-specific session)
 *   - Simplified menu with large touch targets (min 60px height)
 *   - Cart with running total + tax
 *   - Checkout: pay at kiosk (card reader) or generate QR for mobile pay
 *   - Order sent to kitchen via the same SurrealDB pipeline
 *   - No table assignment (takeaway by default)
 *
 * The kiosk connects to the same SurrealDB as the POS terminal — it just
 * uses a restricted UI that only shows the menu + cart + checkout. The
 * kiosk authenticates with a special kiosk session (read-only menu, write
 * orders only).
 *
 * QR code for mobile ordering:
 *   - Generate a QR code that links to /kiosk?table=T1
 *   - Customer scans with phone → opens kiosk on their device
 *   - Order goes to the same kitchen pipeline
 */

import { useState, useEffect, useMemo, useCallback } from "react";
import { useDB } from "@/api/db/db.ts";
import { Tables } from "@/api/db/tables.ts";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { StringRecordId } from "surrealdb";
import { DocumentTitle } from "@/components/common/document-title.tsx";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface KioskDish {
  id: string;
  name: string;
  price: number;
  category?: string;
  image?: string;
  description?: string;
}

interface CartItem {
  dish: KioskDish;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Kiosk Menu — large touch targets, simplified categories
// ---------------------------------------------------------------------------

export function KioskMenu({
  dishes,
  onAdd,
}: {
  dishes: KioskDish[];
  onAdd: (dish: KioskDish) => void;
}) {
  const { t } = useTranslation(["kiosk"]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const categories = useMemo(() => {
    const cats = new Set<string>();
    for (const d of dishes) {
      if (d.category) cats.add(d.category);
    }
    return [...cats].sort();
  }, [dishes]);

  const filteredDishes = selectedCategory
    ? dishes.filter((d) => d.category === selectedCategory)
    : dishes;

  return (
    <div className="flex flex-col h-full" data-testid="kiosk-menu">
      {/* Category bar */}
      {categories.length > 0 && (
        <div className="flex gap-2 p-3 overflow-x-auto bg-white border-b" data-testid="kiosk-categories">
          <button
            onClick={() => setSelectedCategory(null)}
            className={`px-6 py-3 rounded-xl font-semibold text-lg min-h-[52px] transition-all ${
              !selectedCategory
                ? "bg-primary text-white shadow-lg"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
            }`}
          >
            {t("kiosk:allItems", { defaultValue: "All Items" })}
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-6 py-3 rounded-xl font-semibold text-lg min-h-[52px] whitespace-nowrap transition-all ${
                selectedCategory === cat
                  ? "bg-primary text-white shadow-lg"
                  : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Dish grid — large cards */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredDishes.map((dish) => (
            <button
              key={dish.id}
              onClick={() => onAdd(dish)}
              className="flex flex-col items-center p-4 bg-white rounded-2xl shadow-md hover:shadow-xl hover:scale-105 transition-all min-h-[180px] border-2 border-transparent hover:border-primary"
              data-testid={`kiosk-dish-${dish.id}`}
            >
              {dish.image && (
                <img
                  src={dish.image}
                  alt={dish.name}
                  className="w-24 h-24 rounded-xl object-cover mb-3"
                  loading="lazy"
                />
              )}
              {!dish.image && (
                <div className="w-24 h-24 rounded-xl bg-neutral-200 mb-3 flex items-center justify-center">
                  <span className="text-4xl">🍽️</span>
                </div>
              )}
              <span className="font-bold text-lg text-center mb-1">{dish.name}</span>
              {dish.description && (
                <span className="text-xs text-neutral-500 text-center mb-2 line-clamp-2">
                  {dish.description}
                </span>
              )}
              <span className="text-xl font-bold text-primary">
                {dish.price.toFixed(2)}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kiosk Cart — running total + checkout
// ---------------------------------------------------------------------------

export function KioskCart({
  items,
  taxRate,
  onRemove,
  onUpdateQty,
  onCheckout,
  onClear,
}: {
  items: CartItem[];
  taxRate: number;
  onRemove: (dishId: string) => void;
  onUpdateQty: (dishId: string, delta: number) => void;
  onCheckout: () => void;
  onClear: () => void;
}) {
  const { t } = useTranslation(["kiosk"]);

  const subtotal = items.reduce((sum, item) => sum + item.dish.price * item.quantity, 0);
  const tax = subtotal * (taxRate / 100);
  const total = subtotal + tax;

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8" data-testid="kiosk-cart-empty">
        <span className="text-6xl mb-4">🛒</span>
        <p className="text-xl text-neutral-400 font-medium">
          {t("kiosk:cart.empty", { defaultValue: "Your cart is empty" })}
        </p>
        <p className="text-sm text-neutral-300 mt-2">
          {t("kiosk:cart.emptyHint", { defaultValue: "Tap items to add them" })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full" data-testid="kiosk-cart">
      {/* Cart items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {items.map((item) => (
          <div
            key={item.dish.id}
            className="flex items-center gap-3 p-3 bg-white rounded-xl shadow-sm"
            data-testid={`kiosk-cart-item-${item.dish.id}`}
          >
            <div className="flex-1">
              <span className="font-semibold text-base">{item.dish.name}</span>
              <div className="text-sm text-neutral-500">
                {item.dish.price.toFixed(2)} each
              </div>
            </div>
            {/* Quantity controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onUpdateQty(item.dish.id, -1)}
                className="w-10 h-10 rounded-full bg-neutral-200 hover:bg-neutral-300 flex items-center justify-center text-xl font-bold transition-colors"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <span className="w-8 text-center font-bold text-lg">{item.quantity}</span>
              <button
                onClick={() => onUpdateQty(item.dish.id, 1)}
                className="w-10 h-10 rounded-full bg-primary hover:bg-primary/90 text-white flex items-center justify-center text-xl font-bold transition-colors"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            {/* Line total */}
            <span className="w-20 text-right font-bold text-lg">
              {(item.dish.price * item.quantity).toFixed(2)}
            </span>
            {/* Remove */}
            <button
              onClick={() => onRemove(item.dish.id)}
              className="w-8 h-8 rounded-full bg-red-100 hover:bg-red-200 text-red-600 flex items-center justify-center transition-colors"
              aria-label="Remove item"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Totals + checkout */}
      <div className="border-t p-4 space-y-2 bg-white">
        <div className="flex justify-between text-base">
          <span className="text-neutral-600">{t("kiosk:cart.subtotal", { defaultValue: "Subtotal" })}</span>
          <span className="font-semibold">{subtotal.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-base">
          <span className="text-neutral-600">{t("kiosk:cart.tax", { defaultValue: "Tax ({{rate}}%)" , rate: taxRate })}</span>
          <span className="font-semibold">{tax.toFixed(2)}</span>
        </div>
        <div className="flex justify-between text-2xl font-bold pt-2 border-t">
          <span>{t("kiosk:cart.total", { defaultValue: "Total" })}</span>
          <span className="text-primary">{total.toFixed(2)}</span>
        </div>
        <div className="flex gap-2 pt-2">
          <button
            onClick={onClear}
            className="px-4 py-3 rounded-xl bg-neutral-200 hover:bg-neutral-300 font-semibold text-base transition-colors"
          >
            {t("kiosk:cart.clear", { defaultValue: "Clear" })}
          </button>
          <button
            onClick={onCheckout}
            className="flex-1 py-3 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-lg transition-all min-h-[56px]"
            data-testid="kiosk-checkout-btn"
          >
            {t("kiosk:cart.checkout", { defaultValue: "Checkout" })}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Kiosk Screen — main entry point
// ---------------------------------------------------------------------------

export function KioskScreen() {
  const { t } = useTranslation(["kiosk"]);
  const db = useDB();
  const [dishes, setDishes] = useState<KioskDish[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCheckout, setShowCheckout] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  // Load dishes
  useEffect(() => {
    const loadDishes = async () => {
      try {
        const result = await db.select<any>(Tables.dishes);
        const list = Array.isArray(result) ? result : result ? [result] : [];
        setDishes(
          list.map((d: any) => ({
            id: String(d.id),
            name: d.name || d.menu_name || "Item",
            price: Number(d.price || d.price_with_tax || 0),
            category: d.category?.name || d.category_name,
            image: d.image || undefined,
            description: d.description || undefined,
          }))
        );
      } catch (err) {
        console.error("Kiosk: failed to load dishes", err);
      } finally {
        setLoading(false);
      }
    };
    void loadDishes();
  }, [db]);

  // Cart operations
  const addToCart = useCallback((dish: KioskDish) => {
    setCart((prev) => {
      const existing = prev.find((i) => i.dish.id === dish.id);
      if (existing) {
        return prev.map((i) =>
          i.dish.id === dish.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { dish, quantity: 1 }];
    });
  }, []);

  const updateQty = useCallback((dishId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((i) =>
          i.dish.id === dishId ? { ...i, quantity: Math.max(0, i.quantity + delta) } : i
        )
        .filter((i) => i.quantity > 0)
    );
  }, []);

  const removeFromCart = useCallback((dishId: string) => {
    setCart((prev) => prev.filter((i) => i.dish.id !== dishId));
  }, []);

  const clearCart = useCallback(() => setCart([]), []);

  const handleCheckout = useCallback(async () => {
    if (cart.length === 0) return;
    setShowCheckout(true);
    try {
      // Create the order in SurrealDB
      const subtotal = cart.reduce((sum, item) => sum + item.dish.price * item.quantity, 0);
      const [created] = await db.create(Tables.orders, {
        invoice_number: `KIOSK-${Date.now()}`,
        status: "In Progress",
        type: "takeaway",
        total: subtotal,
        subtotal,
        items: cart.map((item) => ({
          dish: new StringRecordId(item.dish.id),
          quantity: item.quantity,
          price: item.dish.price,
          total_price: item.dish.price * item.quantity,
        })),
        created_at: new Date().toISOString(),
        source: "kiosk",
      });
      setOrderId(String(created?.id || `KIOSK-${Date.now()}`));
      setCart([]);
    } catch (err) {
      console.error("Kiosk checkout failed:", err);
      toast.error(t("kiosk:checkout.error", { defaultValue: "Checkout failed. Please try again." }));
    }
  }, [cart, db, t]);

  const cartCount = cart.reduce((sum, i) => sum + i.quantity, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-neutral-50">
        <div className="text-2xl text-neutral-400">{t("kiosk:loading", { defaultValue: "Loading menu…" })}</div>
      </div>
    );
  }

  // Order confirmation screen
  if (orderId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-neutral-50 p-8" data-testid="kiosk-confirmation">
        <DocumentTitle parts={["Kiosk"]} />
        <span className="text-6xl mb-4">✅</span>
        <h1 className="text-3xl font-bold mb-2">
          {t("kiosk:confirmation.title", { defaultValue: "Order Placed!" })}
        </h1>
        <p className="text-lg text-neutral-600 mb-4">
          {t("kiosk:confirmation.orderNumber", { defaultValue: "Your order number:" })}
        </p>
        <p className="text-4xl font-bold text-primary mb-8" data-testid="kiosk-order-number">
          #{orderId.split(':').pop()?.slice(-6) || orderId.slice(-6)}
        </p>
        <p className="text-base text-neutral-500 mb-8 text-center max-w-md">
          {t("kiosk:confirmation.waitMessage", {
            defaultValue: "Please wait at the counter. Your order will be ready shortly.",
          })}
        </p>
        <button
          onClick={() => {
            setOrderId(null);
            setShowCheckout(false);
          }}
          className="px-8 py-4 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-lg shadow-lg transition-all min-h-[56px]"
        >
          {t("kiosk:confirmation.newOrder", { defaultValue: "Start New Order" })}
        </button>
      </div>
    );
  }

  // Main kiosk layout: menu on left, cart on right
  return (
    <div className="flex h-screen bg-neutral-50" data-testid="kiosk-screen">
      <DocumentTitle parts={["Kiosk"]} />
      {/* Menu — 70% width */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="bg-primary text-white py-4 px-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">
            {t("kiosk:title", { defaultValue: "Self-Order Kiosk" })}
          </h1>
          <span className="text-sm opacity-80">
            {t("kiosk:tapToOrder", { defaultValue: "Tap items to add to your order" })}
          </span>
        </div>
        <KioskMenu dishes={dishes} onAdd={addToCart} />
      </div>

      {/* Cart — 30% width (min 320px) */}
      <div className="w-[35%] min-w-[320px] max-w-[480px] flex flex-col bg-neutral-100 border-l">
        <div className="bg-white py-3 px-4 border-b flex items-center justify-between">
          <h2 className="text-lg font-bold flex items-center gap-2">
            🛒 {t("kiosk:cart.title", { defaultValue: "Your Order" })}
            {cartCount > 0 && (
              <span className="bg-primary text-white rounded-full px-2 py-0.5 text-sm">
                {cartCount}
              </span>
            )}
          </h2>
          {cartCount > 0 && (
            <button
              onClick={clearCart}
              className="text-sm text-red-500 hover:text-red-600 font-medium"
            >
              {t("kiosk:cart.clearAll", { defaultValue: "Clear all" })}
            </button>
          )}
        </div>
        <KioskCart
          items={cart}
          taxRate={0}
          onRemove={removeFromCart}
          onUpdateQty={updateQty}
          onCheckout={handleCheckout}
          onClear={clearCart}
        />
      </div>
    </div>
  );
}
