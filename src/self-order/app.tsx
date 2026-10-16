import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  CartItemInput,
  CheckoutStart,
  CheckoutStatus,
  formatMoney,
  MenuDish,
  PaymentMethod,
  PublicMenu,
  Quote,
} from './api.ts';
import { watchSelfOrderTheme } from './theme.ts';

const StripePay = lazy(() => import('./payment.tsx').then((m) => ({ default: m.StripePay })));
const PaypalPay = lazy(() => import('./payment.tsx').then((m) => ({ default: m.PaypalPay })));

interface CartLine extends CartItemInput {
  key: string;
}

const storage = {
  get<T>(key: string): T | null {
    try {
      const raw = sessionStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown) {
    try {
      if (value == null) sessionStorage.removeItem(key);
      else sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode — cart just won't survive a reload */
    }
  },
};

const optionTotal = (dish: MenuDish, modifiers: Record<string, string[]>) =>
  dish.modifierGroups.reduce(
    (sum, group) =>
      sum + (modifiers[group.id] ?? []).reduce((s, id) => s + (group.options.find((o) => o.id === id)?.price ?? 0), 0),
    0,
  );

/** Lowest possible price once required options are picked ("from …"). */
const fromPrice = (dish: MenuDish) =>
  dish.price +
  dish.modifierGroups
    .filter((g) => g.required > 0)
    .reduce((sum, g) => sum + [...g.options].map((o) => o.price).sort((a, b) => a - b).slice(0, g.required).reduce((s, p) => s + p, 0), 0);

const optionNames = (dish: MenuDish, modifiers: Record<string, string[]>) =>
  dish.modifierGroups.flatMap((g) => (modifiers[g.id] ?? []).map((id) => g.options.find((o) => o.id === id)?.name).filter(Boolean) as string[]);

const tableLabel = (menu: PublicMenu) => [menu.table.floor, `Table ${menu.table.number || menu.table.name}`].filter(Boolean).join(' · ');

/** A checkout that is paid and on its way to the kitchen. */
const isSettled = (status: CheckoutStatus) =>
  status.status === 'paid' || status.status === 'submitted';

/* ------------------------------------------------------------------ shell */

export function SelfOrderApp({ token, returningCheckoutId }: { token: string; returningCheckoutId: string | null }) {
  const [menu, setMenu] = useState<PublicMenu | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cart, setCart] = useState<CartLine[]>(() => storage.get<CartLine[]>(`so-cart:${token}`) ?? []);
  const [activeDish, setActiveDish] = useState<MenuDish | null>(null);
  const [sheet, setSheet] = useState<'none' | 'cart' | 'checkout'>('none');
  const [done, setDone] = useState<CheckoutStatus | null>(() => storage.get<CheckoutStatus>(`so-done:${token}`));
  const [orderReady, setOrderReady] = useState(false);
  const [resuming, setResuming] = useState(!!returningCheckoutId);

  const load = useCallback(() => {
    setError(null);
    if (!token) {
      setError('This link is missing its table code. Please scan the QR code on your table again.');
      return;
    }
    api.menu(token).then(setMenu, (err: ApiError) => setError(err.message));
  }, [token]);

  useEffect(load, [load]);
  useEffect(() => storage.set(`so-cart:${token}`, cart), [cart, token]);

  // Apply the theme configured in Manage → QR Ordering (brand + light/dark/system).
  useEffect(
    () => watchSelfOrderTheme(menu?.theme?.brand, menu?.theme?.mode, menu?.theme?.customPrimary),
    [menu?.theme?.brand, menu?.theme?.mode, menu?.theme?.customPrimary],
  );

  const finish = (status: CheckoutStatus) => {
    setDone(status);
    storage.set(`so-done:${token}`, status);
    // Keep the cart when payment didn't settle, so the guest can retry instead
    // of losing their order.
    if (isSettled(status)) {
      setCart([]);
    }
    setSheet('none');
    window.scrollTo({ top: 0 });
  };

  // Back from a payment redirect (e.g. 3-D Secure): confirm the checkout.
  useEffect(() => {
    if (!returningCheckoutId) return;
    api
      .confirm(token, returningCheckoutId)
      .then(finish)
      .catch((err: ApiError) => setError(err.message))
      .finally(() => {
        setResuming(false);
        const url = new URL(window.location.href);
        url.searchParams.delete('checkout');
        ['payment_intent', 'payment_intent_client_secret', 'redirect_status'].forEach((p) => url.searchParams.delete(p));
        window.history.replaceState(null, '', url.toString());
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [returningCheckoutId, token]);

  // While the order is with the kitchen, poll for readiness so the guest gets a
  // visual + haptic alert (no spoken announcement, unlike the order-display screen).
  useEffect(() => {
    if (!done || !isSettled(done) || orderReady) return;
    const checkoutId = done.checkoutId;
    let cancelled = false;

    const poll = async () => {
      try {
        const status = await api.status(token, checkoutId);
        if (cancelled || !status?.orderReady) return;
        setOrderReady(true);
        try {
          navigator.vibrate?.([180, 120, 180, 120, 380]);
        } catch {
          /* vibration unsupported (e.g. iOS) — the visual alert still shows */
        }
      } catch {
        /* transient network error — retry on the next tick */
      }
    };

    void poll();
    const timer = window.setInterval(poll, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [done, orderReady, token]);

  const dishMap = useMemo(() => new Map((menu?.dishes ?? []).map((d) => [d.id, d])), [menu]);
  const liveCart = useMemo(() => cart.filter((line) => dishMap.has(line.dishId)), [cart, dishMap]);
  const cartCount = liveCart.reduce((sum, l) => sum + l.quantity, 0);
  const cartEstimate = liveCart.reduce((sum, l) => {
    const dish = dishMap.get(l.dishId)!;
    return sum + (dish.price + optionTotal(dish, l.modifiers)) * l.quantity;
  }, 0);

  if (resuming) return <CenteredMessage title="Confirming your payment" spinner />;

  if (done) {
    return (
      <DoneScreen
        status={done}
        orderReady={orderReady}
        restaurantName={menu?.restaurant.name ?? ''}
        tableLabel={menu ? tableLabel(menu) : ''}
        onNewOrder={() => {
          setDone(null);
          setOrderReady(false);
          storage.set(`so-done:${token}`, null);
        }}
      />
    );
  }

  if (error && !menu) {
    return <CenteredMessage title="We’re sorry" body={error} action={token ? { label: 'Try again', onClick: load } : undefined} />;
  }
  if (!menu) return <CenteredMessage title="Preparing the menu" spinner />;

  const addLine = (line: Omit<CartLine, 'key'>) => {
    setCart((prev) => {
      const same = prev.find(
        (l) => l.dishId === line.dishId && !l.comments && !line.comments && JSON.stringify(l.modifiers) === JSON.stringify(line.modifiers),
      );
      if (same) return prev.map((l) => (l === same ? { ...l, quantity: l.quantity + line.quantity } : l));
      return [...prev, { ...line, key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}` }];
    });
  };

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-32">
      {error && (
        <div className="sticky top-0 z-30 flex items-start justify-between gap-3 border-b border-[#e2b8a3] bg-[#f8e9e1] px-4 py-3 text-sm text-[#7a3517]">
          <p>{error}</p>
          <button className="shrink-0 font-semibold underline" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      <MenuView
        menu={menu}
        onPick={(dish) => {
          if (dish.modifierGroups.length === 0) {
            addLine({ dishId: dish.id, quantity: 1, modifiers: {} });
            flash(`${dish.name} added to your order`);
          } else {
            setActiveDish(dish);
          }
        }}
        cartQty={(dishId) => liveCart.filter((l) => l.dishId === dishId).reduce((s, l) => s + l.quantity, 0)}
      />

      {cartCount > 0 && sheet === 'none' && !activeDish && (
        <div className="so-safe-bottom fixed inset-x-0 bottom-0 z-20 bg-gradient-to-t from-[color:var(--so-paper)] via-[color:var(--so-paper)] to-transparent px-4 pt-6">
          <button className="so-btn-primary mx-auto max-w-xl !py-3.5 !pl-3.5" onClick={() => setSheet('cart')}>
            <span className="flex items-center gap-3">
              <span className="flex h-9 min-w-9 items-center justify-center rounded-full bg-[color:var(--so-gold)] px-2 text-sm font-bold text-[color:var(--so-gold-soft)]">
                {cartCount}
              </span>
              <span>View your order</span>
            </span>
            <span className="tabular-nums">{formatMoney(cartEstimate, menu.currency)}</span>
          </button>
        </div>
      )}

      {activeDish && (
        <DishSheet
          dish={activeDish}
          currency={menu.currency}
          onClose={() => setActiveDish(null)}
          onAdd={(line) => {
            addLine(line);
            setActiveDish(null);
            flash(`${activeDish.name} added to your order`);
          }}
        />
      )}

      {sheet === 'cart' && (
        <CartSheet
          lines={liveCart}
          dishMap={dishMap}
          currency={menu.currency}
          orderTax={menu.orderTax}
          onChangeQty={(key, qty) =>
            setCart((prev) => (qty <= 0 ? prev.filter((l) => l.key !== key) : prev.map((l) => (l.key === key ? { ...l, quantity: qty } : l))))
          }
          onClose={() => setSheet('none')}
          onCheckout={() => setSheet('checkout')}
        />
      )}

      {sheet === 'checkout' && (
        <CheckoutSheet
          token={token}
          menu={menu}
          lines={liveCart}
          onBack={() => setSheet('cart')}
          onDone={finish}
          onMenuChanged={() => {
            setSheet('none');
            load();
          }}
        />
      )}

      <Toast />
    </div>
  );
}

/* ------------------------------------------------------------------- menu */

function MenuView({
  menu,
  onPick,
  cartQty,
}: {
  menu: PublicMenu;
  onPick: (dish: MenuDish) => void;
  cartQty: (dishId: string) => number;
}) {
  const [active, setActive] = useState(menu.categories[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const sectionRefs = useRef(new Map<string, HTMLElement>());
  const tabsRef = useRef<HTMLDivElement>(null);

  const q = query.trim().toLowerCase();
  const sections = menu.categories
    .map((category) => ({
      category,
      dishes: menu.dishes.filter((d) => d.categoryIds[0] === category.id && (!q || d.name.toLowerCase().includes(q))),
    }))
    .filter((s) => s.dishes.length > 0);

  // Highlight the category currently on screen.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible) setActive(visible.target.getAttribute('data-cat') ?? '');
      },
      { rootMargin: '-120px 0px -60% 0px' },
    );
    sectionRefs.current.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections.length, q]);

  useEffect(() => {
    tabsRef.current?.querySelector(`[data-tab="${CSS.escape(active)}"]`)?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' });
  }, [active]);

  return (
    <>
      <header className="so-hero relative overflow-hidden px-6 pb-10 pt-10 text-[color:var(--so-on-ink)]">
        <div className="flex items-center justify-between">
          <span className="so-eyebrow text-[color:var(--so-gold-soft)]">{menu.table.floor || 'Welcome'}</span>
          <span className="rounded-full border border-[color:var(--so-on-ink)] px-3.5 py-1.5 text-xs font-semibold tracking-wide text-[color:var(--so-gold-soft)]">
            Table {menu.table.number || menu.table.name}
          </span>
        </div>
        <h1 className="so-serif mt-8 text-[2.3rem] font-bold leading-[1.05] tracking-tight">{menu.restaurant.name || 'Our Menu'}</h1>
        <div className="so-ornament mt-4 max-w-[12rem] text-xs">✦</div>
        <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-[color:var(--so-on-ink)]">
          {menu.restaurant.welcomeText || 'Choose at your leisure, pay from your seat — we’ll bring everything to your table.'}
        </p>
        <div className="relative mt-7">
          <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--so-gold-soft)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" strokeLinecap="round" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search dishes"
            className="so-hero-field w-full rounded-full py-3.5 pl-11 pr-4 text-base outline-none"
          />
        </div>
      </header>

      <nav
        ref={tabsRef}
        className="so-scroll-x sticky top-0 z-10 flex gap-7 overflow-x-auto border-b border-[color:var(--so-line)] bg-[color:var(--so-paper)] px-6 backdrop-blur"
      >
        {sections.map(({ category }) => (
          <button
            key={category.id}
            data-tab={category.id}
            onClick={() => sectionRefs.current.get(category.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            className={`relative shrink-0 py-4 text-sm font-semibold tracking-wide transition-colors ${
              active === category.id ? 'text-[color:var(--so-fg)]' : 'text-[color:var(--so-muted)]'
            }`}
          >
            {category.name}
            <span
              className={`absolute inset-x-0 -bottom-px h-[2px] rounded-full bg-[color:var(--so-gold)] transition-opacity ${
                active === category.id ? 'opacity-100' : 'opacity-0'
              }`}
            />
          </button>
        ))}
      </nav>

      {sections.length === 0 && (
        <p className="so-serif px-6 py-16 text-center text-xl italic text-[color:var(--so-muted)]">Nothing matches “{query}”.</p>
      )}

      {sections.map(({ category, dishes }) => (
        <section
          key={category.id}
          data-cat={category.id}
          ref={(el) => {
            if (el) sectionRefs.current.set(category.id, el);
            else sectionRefs.current.delete(category.id);
          }}
          className="scroll-mt-14 px-6 pt-10"
        >
          <div className="mb-2 text-center">
            <p className="so-eyebrow text-[color:var(--so-gold-ink)]">{String(dishes.length).padStart(2, '0')} dishes</p>
            <h2 className="so-serif mt-1 text-[1.6rem] font-bold leading-tight tracking-tight">{category.name}</h2>
            <div className="so-ornament mx-auto mt-2 max-w-[9rem] text-[0.6rem]">◆</div>
          </div>

          <ul>
            {dishes.map((dish) => {
              const qty = cartQty(dish.id);
              const hasRequired = dish.modifierGroups.some((g) => g.required > 0);
              const price = fromPrice(dish);
              const optionHint = dish.modifierGroups.map((g) => g.name).join(' · ');
              return (
                <li key={dish.id} className="border-b border-[color:var(--so-line)] last:border-b-0">
                  <button onClick={() => onPick(dish)} className="flex w-full items-center gap-4 py-5 text-left active:opacity-70">
                    <span className="min-w-0 flex-1">
                      <span className="flex items-end">
                        <span className="so-serif text-[1.08rem] font-semibold leading-snug">{dish.name}</span>
                        <span className="so-leader" />
                        <span className="shrink-0 pb-0.5 text-[0.95rem] font-semibold tabular-nums text-[color:var(--so-gold-ink)]">
                          {hasRequired && price !== dish.price && (
                            <span className="mr-1 text-[0.7rem] font-medium uppercase tracking-wider text-[color:var(--so-muted)]">from</span>
                          )}
                          {formatMoney(price, menu.currency)}
                        </span>
                      </span>
                      {optionHint && <span className="mt-1 block text-[0.8rem] text-[color:var(--so-muted)]">{optionHint}</span>}
                    </span>
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-lg transition-colors ${
                        qty > 0
                          ? 'bg-[color:var(--so-ink)] text-sm font-bold text-[color:var(--so-gold-soft)]'
                          : 'border border-[color:var(--so-gold)] text-[color:var(--so-gold-ink)]'
                      }`}
                      aria-label={qty > 0 ? `${qty} in your order` : 'Add'}
                    >
                      {qty > 0 ? qty : '+'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      <footer className="px-6 pb-10 pt-14 text-center">
        <div className="so-ornament mx-auto max-w-[10rem] text-xs">✦</div>
        <p className="so-serif mt-3 text-lg italic text-[color:var(--so-muted)]">Thank you for dining with us</p>
      </footer>
    </>
  );
}

/* ------------------------------------------------------------------ sheets */

function Sheet({
  title,
  eyebrow,
  onClose,
  children,
  footer,
}: {
  title: string;
  eyebrow?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  return (
    <div className="so-backdrop fixed inset-0 z-30 flex items-end justify-center bg-[#17140f]/55 backdrop-blur-[2px]" onClick={onClose}>
      <div
        className="so-sheet flex max-h-[92vh] w-full max-w-xl flex-col rounded-t-[28px] bg-[color:var(--so-paper)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={title}
      >
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-[color:var(--so-line)]" />
        <div className="flex items-start justify-between gap-4 px-6 pb-4 pt-4">
          <div className="min-w-0">
            {eyebrow && <p className="so-eyebrow text-[color:var(--so-gold-ink)]">{eyebrow}</p>}
            <h2 className="so-serif mt-0.5 text-[1.45rem] font-bold leading-tight tracking-tight">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[color:var(--so-line)] text-lg leading-none text-[color:var(--so-muted)]"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-4">{children}</div>
        {footer && <div className="so-safe-bottom border-t border-[color:var(--so-line)] px-6 pt-4">{footer}</div>}
      </div>
    </div>
  );
}

function QtyStepper({ value, onChange, min = 1 }: { value: number; onChange: (v: number) => void; min?: number }) {
  return (
    <div className="flex items-center rounded-full border border-[color:var(--so-line)] bg-[color:var(--so-card)]">
      <button className="h-10 w-10 text-lg text-[color:var(--so-muted)] disabled:opacity-30" onClick={() => onChange(value - 1)} disabled={value <= min - 1} aria-label="Less">
        −
      </button>
      <span className="w-6 text-center font-semibold tabular-nums">{value}</span>
      <button className="h-10 w-10 text-lg text-[color:var(--so-fg)]" onClick={() => onChange(Math.min(50, value + 1))} aria-label="More">
        +
      </button>
    </div>
  );
}

function DishSheet({
  dish,
  currency,
  onClose,
  onAdd,
}: {
  dish: MenuDish;
  currency: string;
  onClose: () => void;
  onAdd: (line: Omit<CartLine, 'key'>) => void;
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [quantity, setQuantity] = useState(1);
  const [comments, setComments] = useState('');

  const missing = dish.modifierGroups.filter((g) => g.required > 0 && (picked[g.id]?.length ?? 0) !== g.required);
  const unit = dish.price + optionTotal(dish, picked);

  const toggle = (groupId: string, optionId: string, required: number) => {
    setPicked((prev) => {
      const current = prev[groupId] ?? [];
      if (current.includes(optionId)) return { ...prev, [groupId]: current.filter((id) => id !== optionId) };
      if (required === 1) return { ...prev, [groupId]: [optionId] };
      if (required > 1 && current.length >= required) return prev;
      return { ...prev, [groupId]: [...current, optionId] };
    });
  };

  return (
    <Sheet
      title={dish.name}
      eyebrow="Make it yours"
      onClose={onClose}
      footer={
        <div className="flex items-center gap-3 pb-1">
          <QtyStepper value={quantity} onChange={(v) => setQuantity(Math.max(1, v))} min={2} />
          <button
            disabled={missing.length > 0}
            onClick={() => {
              const modifiers = Object.fromEntries(Object.entries(picked).filter(([, ids]) => ids.length > 0));
              onAdd({ dishId: dish.id, quantity, modifiers, comments: comments.trim() || undefined });
            }}
            className="so-btn-primary flex-1"
          >
            <span>{missing.length > 0 ? 'Pick your options' : 'Add to order'}</span>
            {missing.length === 0 && <span className="tabular-nums text-[color:var(--so-gold-ink)]">{formatMoney(unit * quantity, currency)}</span>}
          </button>
        </div>
      }
    >
      {dish.modifierGroups.map((group) => {
        const selected = picked[group.id] ?? [];
        const complete = group.required > 0 && selected.length === group.required;
        return (
          <fieldset key={group.id} className="mb-7">
            <legend className="mb-3 flex w-full items-baseline justify-between">
              <span className="so-serif text-[1.05rem] font-semibold">{group.name}</span>
              <span
                className={`so-eyebrow !text-[0.6rem] ${
                  group.required === 0 ? 'text-[color:var(--so-muted)]' : complete ? 'text-[color:var(--so-gold-ink)]' : 'text-[#a4552f]'
                }`}
              >
                {group.required === 0 ? 'Optional' : complete ? '✓ Selected' : group.required === 1 ? 'Required' : `Choose ${group.required}`}
              </span>
            </legend>
            <div className="overflow-hidden rounded-2xl border border-[color:var(--so-line)] bg-[color:var(--so-card)]">
              {group.options.map((option, index) => {
                const checked = selected.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`flex cursor-pointer items-center justify-between gap-3 px-4 py-3.5 transition-colors ${
                      index > 0 ? 'border-t border-[color:var(--so-line)]' : ''
                    } ${checked ? 'bg-[#f3ead9]' : ''}`}
                  >
                    <span className="flex items-center gap-3.5">
                      <input
                        type={group.required === 1 ? 'radio' : 'checkbox'}
                        name={group.id}
                        checked={checked}
                        onChange={() => toggle(group.id, option.id, group.required)}
                        className="so-choice"
                      />
                      <span className="font-medium">{option.name}</span>
                    </span>
                    {option.price !== 0 && (
                      <span className="text-sm font-semibold tabular-nums text-[color:var(--so-gold-ink)]">+{formatMoney(option.price, currency)}</span>
                    )}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
      <label className="block">
        <span className="so-serif mb-3 block text-xl font-semibold">Special requests</span>
        <textarea
          value={comments}
          onChange={(e) => setComments(e.target.value.slice(0, 200))}
          rows={2}
          placeholder="Allergies, no onions, well done…"
          className="so-field resize-none"
        />
      </label>
    </Sheet>
  );
}

function CartSheet({
  lines,
  dishMap,
  currency,
  orderTax,
  onChangeQty,
  onClose,
  onCheckout,
}: {
  lines: CartLine[];
  dishMap: Map<string, MenuDish>;
  currency: string;
  orderTax: PublicMenu['orderTax'];
  onChangeQty: (key: string, qty: number) => void;
  onClose: () => void;
  onCheckout: () => void;
}) {
  const total = lines.reduce((sum, l) => {
    const dish = dishMap.get(l.dishId)!;
    return sum + (dish.price + optionTotal(dish, l.modifiers)) * l.quantity;
  }, 0);
  const hasExclusive = orderTax && lines.some((l) => dishMap.get(l.dishId)?.taxMode === 'exclusive');

  return (
    <Sheet
      title="Your order"
      eyebrow={`${lines.reduce((s, l) => s + l.quantity, 0)} items`}
      onClose={onClose}
      footer={
        <button disabled={lines.length === 0} onClick={onCheckout} className="so-btn-primary mb-1">
          <span>Continue to payment</span>
          <span className="tabular-nums text-[color:var(--so-gold-soft)]">{formatMoney(total, currency)}</span>
        </button>
      }
    >
      {lines.length === 0 && <p className="so-serif py-10 text-center text-xl italic text-[color:var(--so-muted)]">Your order is empty.</p>}
      <ul>
        {lines.map((line) => {
          const dish = dishMap.get(line.dishId)!;
          const options = optionNames(dish, line.modifiers);
          return (
            <li key={line.key} className="flex items-start justify-between gap-4 border-b border-[color:var(--so-line)] py-5 last:border-b-0">
              <div className="min-w-0">
                <p className="so-serif text-[1.05rem] font-semibold leading-snug">{dish.name}</p>
                {options.length > 0 && <p className="mt-0.5 text-sm text-[color:var(--so-muted)]">{options.join(' · ')}</p>}
                {line.comments && <p className="so-serif mt-0.5 text-[0.95rem] italic text-[color:var(--so-muted)]">“{line.comments}”</p>}
                <p className="mt-1.5 text-sm font-semibold tabular-nums text-[color:var(--so-gold-ink)]">
                  {formatMoney((dish.price + optionTotal(dish, line.modifiers)) * line.quantity, currency)}
                </p>
              </div>
              <QtyStepper value={line.quantity} onChange={(v) => onChangeQty(line.key, v)} />
            </li>
          );
        })}
      </ul>
      {hasExclusive && (
        <p className="mt-2 text-sm text-[color:var(--so-muted)]">
          {orderTax!.name} ({orderTax!.rate}%) is added at payment.
        </p>
      )}
    </Sheet>
  );
}

function CheckoutSheet({
  token,
  menu,
  lines,
  onBack,
  onDone,
  onMenuChanged,
}: {
  token: string;
  menu: PublicMenu;
  lines: CartLine[];
  onBack: () => void;
  onDone: (status: CheckoutStatus) => void;
  onMenuChanged: () => void;
}) {
  const items = useMemo<CartItemInput[]>(
    () => lines.map(({ dishId, quantity, modifiers, comments }) => ({ dishId, quantity, modifiers, comments })),
    [lines],
  );
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState<{ message: string; code?: string } | null>(null);
  const [name, setName] = useState(() => storage.get<string>('so-name') ?? '');
  const [notes, setNotes] = useState('');
  const [method, setMethod] = useState<PaymentMethod | null>(menu.paymentMethods[0] ?? null);
  const [checkout, setCheckout] = useState<CheckoutStart | null>(null);
  const [busy, setBusy] = useState(false);
  // Stable for one checkout session so a double-tap or retry reuses the same
  // gateway intent instead of creating a second chargeable one.
  const idempotencyKey = useRef(`${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);

  useEffect(() => {
    api.quote(token, items).then(setQuote, (err: ApiError) => setError({ message: err.message, code: err.code }));
  }, [token, items]);

  const confirm = async (checkoutId: string) => {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.confirm(token, checkoutId));
    } catch (err) {
      setError({ message: (err as ApiError).message, code: (err as ApiError).code });
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!method) return;
    setBusy(true);
    setError(null);
    storage.set('so-name', name.trim());
    try {
      const started = await api.checkout(token, {
        items,
        paymentMethodId: method.id,
        gateway: method.gateway,
        customerName: name.trim() || undefined,
        notes: notes.trim() || undefined,
        idempotencyKey: idempotencyKey.current,
      });
      setQuote(started.quote);
      if (started.gateway === 'test') {
        await confirm(started.checkoutId);
        return;
      }
      setCheckout(started);
    } catch (err) {
      setError({ message: (err as ApiError).message, code: (err as ApiError).code });
    } finally {
      setBusy(false);
    }
  };

  const returnUrl = (checkoutId: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set('checkout', checkoutId);
    return url.toString();
  };

  const noMethods = menu.paymentMethods.length === 0;
  // Whether the current order includes any tax-inclusive item, so the tax rows
  // are only labelled "(included)" when that's actually true for this order.
  const hasInclusive = useMemo(() => {
    const dishes = new Map(menu.dishes.map((d) => [d.id, d]));
    return lines.some((l) => dishes.get(l.dishId)?.taxMode === 'inclusive');
  }, [menu, lines]);

  return (
    <Sheet
      title={checkout ? 'Payment' : 'Review & pay'}
      eyebrow={tableLabel(menu)}
      onClose={checkout || busy ? () => undefined : onBack}
      footer={
        checkout ? undefined : (
          <button disabled={!quote || !method || busy} onClick={start} className="so-btn-primary mb-1">
            <span>{busy ? 'One moment…' : method?.gateway === 'test' ? 'Place order · test' : 'Continue to payment'}</span>
            {quote && <span className="tabular-nums text-[color:var(--so-gold-soft)]">{formatMoney(quote.total, quote.currency)}</span>}
          </button>
        )
      }
    >
      {quote ? (
        <div className="rounded-2xl border border-[color:var(--so-line)] bg-[color:var(--so-card)] p-5">
          <ul className="flex flex-col gap-3">
            {quote.items.map((item, i) => (
              <li key={i} className="flex items-end">
                <span className="min-w-0">
                  <span className="so-serif text-[1rem] font-semibold">
                    <span className="text-[color:var(--so-gold-ink)]">{item.quantity}×</span> {item.name}
                  </span>
                  {item.options.length > 0 && <span className="block text-xs text-[color:var(--so-muted)]">{item.options.join(' · ')}</span>}
                </span>
                <span className="so-leader" />
                <span className="shrink-0 text-sm font-semibold tabular-nums">{formatMoney(item.amount, quote.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-1.5 border-t border-[color:var(--so-line)] pt-4 text-sm">
            {quote.taxes.map((tax, i) => (
              <div key={i} className="flex justify-between text-[color:var(--so-muted)]">
                <span>
                  {tax.name} {tax.rate}%{hasInclusive ? ' (included)' : ''}
                </span>
                <span className="tabular-nums">{formatMoney(tax.amount, quote.currency)}</span>
              </div>
            ))}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="so-eyebrow text-[color:var(--so-muted)]">Total</span>
              <span className="so-serif text-[1.6rem] font-bold tabular-nums">{formatMoney(quote.total, quote.currency)}</span>
            </div>
          </div>
        </div>
      ) : (
        !error && <p className="so-serif py-8 text-center text-lg italic text-[color:var(--so-muted)]">Calculating your total…</p>
      )}

      {error && (
        <div className="mt-4 rounded-2xl border border-[#e2b8a3] bg-[#f8e9e1] p-4 text-sm text-[#7a3517]">
          <p>{error.message}</p>
          {(error.code === 'UNAVAILABLE' || error.code === 'MODIFIERS') && (
            <button className="mt-2 font-semibold underline" onClick={onMenuChanged}>
              Back to the menu
            </button>
          )}
        </div>
      )}

      {!checkout && (
        <>
          <div className="mt-6 grid gap-4">
            <label className="block">
              <span className="so-eyebrow mb-2 block text-[color:var(--so-muted)]">Your name · optional</span>
              <input value={name} onChange={(e) => setName(e.target.value.slice(0, 60))} placeholder="So we know who ordered" className="so-field" />
            </label>
            <label className="block">
              <span className="so-eyebrow mb-2 block text-[color:var(--so-muted)]">Note for the kitchen · optional</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 300))} placeholder="Allergies, timing…" className="so-field" />
            </label>
          </div>

          <p className="so-eyebrow mb-3 mt-7 text-[color:var(--so-muted)]">Pay with</p>
          {noMethods ? (
            <p className="rounded-2xl border border-[color:var(--so-line)] bg-[color:var(--so-card)] p-4 text-sm text-[color:var(--so-muted)]">
              Online payment isn’t available right now. Please order with our staff.
            </p>
          ) : (
            <div className="flex flex-col gap-2.5">
              {menu.paymentMethods.map((m) => {
                const on = method?.id === m.id && method.gateway === m.gateway;
                return (
                  <label
                    key={`${m.gateway}:${m.id}`}
                    className={`flex cursor-pointer items-center gap-3.5 rounded-2xl border bg-[color:var(--so-card)] px-4 py-4 transition-all ${
                      on ? 'border-[color:var(--so-ink)] shadow-[0_0_0_1px_var(--so-ink)]' : 'border-[color:var(--so-line)]'
                    }`}
                  >
                    <input type="radio" name="pay" checked={on} onChange={() => setMethod(m)} className="so-choice" />
                    <span className="flex-1 font-semibold">{m.name}</span>
                    <span className="so-eyebrow !text-[0.58rem] text-[color:var(--so-muted)]">
                      {m.gateway === 'test' ? 'Demo' : m.gateway === 'paypal' ? 'PayPal' : 'Card · Wallet'}
                    </span>
                  </label>
                );
              })}
            </div>
          )}

          <button className="so-btn-ghost mt-3" onClick={onBack} disabled={busy}>
            Back to my order
          </button>
        </>
      )}

      {checkout && (
        <div className="mt-6">
          {!checkout.payment || (checkout.gateway !== 'stripe' && checkout.gateway !== 'paypal') ? (
            <div className="rounded-2xl border border-[#e2b8a3] bg-[#f8e9e1] p-4 text-sm text-[#7a3517]">
              <p>We couldn’t start this payment. Please choose another method, or ask a staff member to take your order.</p>
            </div>
          ) : (
            <Suspense fallback={<p className="so-serif py-8 text-center text-lg italic text-[color:var(--so-muted)]">Loading secure payment…</p>}>
              {checkout.gateway === 'stripe' && checkout.payment && (
                <StripePay
                  publishableKey={checkout.payment.publishableKey ?? ''}
                  clientSecret={checkout.payment.clientToken ?? ''}
                  returnUrl={returnUrl(checkout.checkoutId)}
                  amountLabel={formatMoney(checkout.quote.total, checkout.quote.currency)}
                  busy={busy}
                  onPaid={() => confirm(checkout.checkoutId)}
                  onError={(message) => setError({ message })}
                />
              )}
              {checkout.gateway === 'paypal' && checkout.payment && (
                <PaypalPay
                  clientId={checkout.payment.clientId ?? ''}
                  orderId={checkout.payment.intentId}
                  currency={checkout.quote.currency}
                  onApproved={() => confirm(checkout.checkoutId)}
                  onError={(message) => setError({ message })}
                />
              )}
            </Suspense>
          )}
          {busy && <p className="so-serif mt-4 text-center text-lg italic text-[color:var(--so-muted)]">Sending your order to the kitchen…</p>}
          {!busy && (
            <button
              className="so-btn-ghost mt-2"
              onClick={() => {
                setCheckout(null);
                setError(null);
              }}
            >
              Choose another payment method
            </button>
          )}
          <p className="mt-2 flex items-center justify-center gap-1.5 text-xs text-[color:var(--so-muted)]">
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            Secure payment — card details never touch our system
          </p>
        </div>
      )}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ misc */

function DoneScreen({
  status,
  orderReady,
  restaurantName,
  tableLabel,
  onNewOrder,
}: {
  status: CheckoutStatus;
  orderReady?: boolean;
  restaurantName: string;
  tableLabel: string;
  onNewOrder: () => void;
}) {
  // A checkout that failed/expired/pending must not be presented as paid.
  if (!isSettled(status)) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col">
        <div className="so-hero px-6 pb-16 pt-14 text-center text-[color:var(--so-on-ink)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--so-on-ink)] text-2xl font-bold text-[color:var(--so-gold-soft)]">
            !
          </div>
          <p className="so-eyebrow mt-6 text-[color:var(--so-gold-soft)]">{restaurantName || 'Payment'}</p>
          <h1 className="so-serif mt-2 text-[2.1rem] font-bold tracking-tight leading-tight">Payment not completed</h1>
          <p className="mx-auto mt-3 max-w-xs text-[0.95rem] leading-relaxed text-[color:var(--so-on-ink)]">
            {status.message ||
              'Your payment didn’t go through, so no order was sent to the kitchen. Your order is still here — you can try again.'}
          </p>
        </div>

        <div className="so-safe-bottom mt-auto px-5 pt-8">
          <button onClick={onNewOrder} className="so-btn-primary justify-center">
            Try payment again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col">
      <div className="so-hero px-6 pb-16 pt-14 text-center text-[color:var(--so-on-ink)]">
        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-[color:var(--so-on-ink)] text-2xl text-[color:var(--so-gold-soft)] ${orderReady ? 'animate-bounce' : ''}`}>
          {orderReady ? '🔔' : '✓'}
        </div>
        <p className="so-eyebrow mt-6 text-[color:var(--so-gold-soft)]">{restaurantName || 'Order confirmed'}</p>
        <h1 className="so-serif mt-2 text-[2.1rem] font-bold tracking-tight leading-tight">
          {orderReady ? 'Your order is ready!' : 'Thank you'}
        </h1>
        <p className="mx-auto mt-3 max-w-xs text-[0.95rem] leading-relaxed text-[color:var(--so-on-ink)]">
          {orderReady
            ? 'The kitchen has finished your order — we’ll bring it to your table.'
            : 'Your order is paid and with the kitchen. Keep this page open — we’ll alert you here when it’s ready.'}
        </p>
      </div>

      <div className="-mt-10 px-5">
        <div className="rounded-3xl border border-[color:var(--so-line)] bg-[color:var(--so-card)] p-6 shadow-[0_20px_50px_-25px_rgba(23,20,15,0.45)]">
          {orderReady && (
            <div className="mb-5 rounded-2xl border-2 border-[color:var(--so-gold)] bg-[color:var(--so-card)] p-4 text-center">
              <p className="so-serif text-xl font-bold text-[color:var(--so-gold-ink)]">
                Your order is ready
              </p>
              <p className="mt-1 text-sm text-[color:var(--so-muted)]">
                Please collect it from the counter or wait for it at your table.
              </p>
            </div>
          )}
          {status.orderNumber && (
            <div className="text-center">
              <p className="so-eyebrow text-[color:var(--so-muted)]">Order number</p>
              <p className="so-serif mt-1 text-[3rem] font-bold tracking-tight leading-none tabular-nums">#{status.orderNumber}</p>
              {tableLabel && <p className="mt-2 text-sm text-[color:var(--so-muted)]">{tableLabel}</p>}
              <div className="so-ornament mx-auto my-5 max-w-[8rem] text-[0.6rem]">◆</div>
            </div>
          )}
          {status.quote && (
            <ul className="flex flex-col gap-2.5">
              {status.quote.items.map((item, i) => (
                <li key={i} className="flex items-end text-sm">
                  <span className="min-w-0">
                    <span className="font-semibold text-[color:var(--so-gold-ink)]">{item.quantity}×</span> {item.name}
                    {item.options.length > 0 && <span className="text-[color:var(--so-muted)]"> · {item.options.join(', ')}</span>}
                  </span>
                  <span className="so-leader" />
                  <span className="shrink-0 tabular-nums">{formatMoney(item.amount, status.quote.currency)}</span>
                </li>
              ))}
              <li className="mt-2 flex items-baseline justify-between border-t border-[color:var(--so-line)] pt-3">
                <span className="so-eyebrow text-[color:var(--so-muted)]">Paid</span>
                <span className="so-serif text-xl font-bold tabular-nums">{formatMoney(status.quote.total, status.quote.currency)}</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      <div className="so-safe-bottom mt-auto px-5 pt-8">
        <button onClick={onNewOrder} className="so-btn-primary justify-center">
          Order something else
        </button>
      </div>
    </div>
  );
}

function CenteredMessage({
  title,
  body,
  spinner,
  action,
}: {
  title: string;
  body?: string;
  spinner?: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="so-hero flex min-h-screen flex-col items-center justify-center px-8 text-center text-[color:var(--so-on-ink)]">
      {spinner && (
        <div className="so-spinner mb-6 h-10 w-10 animate-spin rounded-full" />
      )}
      <h1 className="so-serif text-3xl font-semibold">{title}</h1>
      {body && <p className="mt-3 max-w-xs text-[color:var(--so-on-ink)]">{body}</p>}
      {action && (
        <button
          onClick={action.onClick}
          className="mt-8 rounded-full border border-[color:var(--so-on-ink)] px-7 py-3 font-semibold text-[color:var(--so-gold-soft)]"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

let flashListener: ((text: string) => void) | null = null;
const flash = (text: string) => flashListener?.(text);

function Toast() {
  const [text, setText] = useState<string | null>(null);
  useEffect(() => {
    let timer: number | undefined;
    flashListener = (t) => {
      setText(t);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setText(null), 1700);
    };
    return () => {
      flashListener = null;
      window.clearTimeout(timer);
    };
  }, []);
  if (!text) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-40 flex justify-center px-4">
      <div className="so-sheet flex items-center gap-2.5 rounded-full bg-[color:var(--so-ink)] px-5 py-3 text-sm font-medium text-[color:var(--so-on-ink)] shadow-xl">
        <span className="text-[color:var(--so-gold-soft)]">✓</span>
        {text}
      </div>
    </div>
  );
}
