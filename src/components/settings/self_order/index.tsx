import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "react-qr-code";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowsRotate, faCopy, faPrint, faUpRightFromSquare } from "@fortawesome/free-solid-svg-icons";
import { Button } from "@/components/common/input/button.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Switch } from "@/components/common/input/switch.tsx";
import { Checkbox } from "@/components/common/input/checkbox.tsx";
import { ReactSelect } from "@/components/common/input/custom.react.select.tsx";
import { DeleteConfirm } from "@/components/common/table/delete.confirm.tsx";
import { getAppTimezone } from "@/lib/datetime.ts";
import { getGatewayBaseUrl } from "@/lib/session.ts";
import { BRAND_IDS, rgbChannelsToHex } from "@/lib/theme.ts";
import { resolveBrandPalette } from "@/lib/brand-palettes.ts";
import { DEFAULT_CUSTOM_PRIMARY, normalizeHex } from "@/lib/derive-brand-palette.ts";
import { cn } from "@/lib/utils.ts";
import {
  SelfOrderConfig,
  SelfOrderSettings,
  SelfOrderTable,
  selfOrderAdmin,
  selfOrderLink,
} from "@/lib/self-order.service.ts";

type Option = { label: string; value: string };

const ONLINE_GATEWAYS = ["stripe", "paypal"];

const isLocalHost = (url: string) => /\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(url);

/** Where phones should open the menu: this page's origin, or — when opened as
 *  localhost — the LAN host the gateway is configured on, with this port. */
function defaultBaseUrl(): string {
  const origin = window.location.origin;
  if (!isLocalHost(origin)) return origin;
  try {
    const gateway = new URL(getGatewayBaseUrl());
    if (!isLocalHost(gateway.origin)) {
      return `${window.location.protocol}//${gateway.hostname}${window.location.port ? `:${window.location.port}` : ""}`;
    }
  } catch {
    /* fall through */
  }
  return origin;
}

/**
 * Manage → QR Ordering: settings for customer self-ordering plus a printable
 * QR code for every table. Customers scan it, order, pay, and the paid order
 * goes straight to the POS / kitchen.
 */
export const AdminSelfOrder = () => {
  const [config, setConfig] = useState<SelfOrderConfig | null>(null);
  const [draft, setDraft] = useState<SelfOrderSettings | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [customHexDraft, setCustomHexDraft] = useState(DEFAULT_CUSTOM_PRIMARY);
  const qrRefs = useRef(new Map<string, HTMLDivElement>());
  const { t } = useTranslation(["admin", "settings"]);
  const tableName = (table: SelfOrderTable) =>
    t("qrOrdering.tableName", { defaultValue: "Table {{name}}", name: table.number || table.name });

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const next = await selfOrderAdmin.config();
      setConfig(next);
      setDraft({
        ...next.settings,
        baseUrl: next.settings.baseUrl || defaultBaseUrl(),
        currency: (import.meta.env.VITE_CURRENCY as string) || next.settings.currency,
        timezone: getAppTimezone(),
      });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Keep the hex input in sync with the saved custom color.
  useEffect(() => {
    const stored = normalizeHex(draft?.themeCustomPrimary);
    if (stored) setCustomHexDraft(stored);
  }, [draft?.themeCustomPrimary]);

  const floors = useMemo(() => {
    const groups = new Map<string, SelfOrderTable[]>();
    for (const table of config?.tables ?? []) {
      const key = table.floorName || t("qrOrdering.otherFloor", { defaultValue: "Other" });
      groups.set(key, [...(groups.get(key) ?? []), table]);
    }
    return [...groups.entries()];
  }, [config?.tables, t]);

  if (loadError) {
    return (
      <div className="p-5">
        <p className="text-danger">
          {t("qrOrdering.loadError", { defaultValue: "Could not load QR ordering: {{error}}", error: loadError })}
        </p>
        <Button className="mt-3" variant="primary" onClick={() => void load()}>
          {t("qrOrdering.tryAgain", { defaultValue: "Try again" })}
        </Button>
      </div>
    );
  }
  if (!config || !draft) return <div className="p-5">{t("qrOrdering.loading", { defaultValue: "Loading…" })}</div>;

  const set = <K extends keyof SelfOrderSettings>(key: K, value: SelfOrderSettings[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));

  const applyCustomPrimary = (raw: string) => {
    const hex = normalizeHex(raw);
    if (!hex) return;
    setCustomHexDraft(hex);
    set("themeBrand", "custom");
    set("themeCustomPrimary", hex);
  };
  const customPrimaryValue =
    normalizeHex(draft?.themeCustomPrimary) ?? normalizeHex(customHexDraft) ?? DEFAULT_CUSTOM_PRIMARY;
  const customPreview = resolveBrandPalette("custom", "light", customPrimaryValue);

  const onlineTypes = config.paymentTypes.filter((pt) => pt.gateway && ONLINE_GATEWAYS.includes(pt.gateway));
  const toOption = (item: { id: string; name: string }): Option => ({ label: item.name, value: item.id });
  const hiddenIds = draft.hiddenCategoryIds ?? config.defaultHiddenCategoryIds;
  const paymentReady = draft.paymentTypeIds.length > 0 || draft.testMode;

  const save = async () => {
    setSaving(true);
    try {
      const { settings } = await selfOrderAdmin.saveSettings(draft);
      setConfig({ ...config, settings });
      toast.success(t("qrOrdering.saved", { defaultValue: "QR ordering settings saved" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const updateTable = async (table: SelfOrderTable, body: { regenerate?: boolean; enabled?: boolean }) => {
    try {
      const { table: updated } = await selfOrderAdmin.updateTable(table.id, body);
      setConfig((prev) => prev && { ...prev, tables: prev.tables.map((t) => (t.id === updated.id ? updated : t)) });
      toast.success(
        body.regenerate
          ? t("qrOrdering.regenerated", { defaultValue: "New QR code created — print it again" })
          : updated.enabled
            ? t("qrOrdering.turnedOn", { defaultValue: "QR code turned on" })
            : t("qrOrdering.turnedOff", { defaultValue: "QR code turned off" }),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    }
  };

  const printCodes = (tables: SelfOrderTable[]) => {
    const cards = tables
      .map((table) => {
        const svg = qrRefs.current.get(table.id)?.querySelector("svg")?.outerHTML ?? "";
        return `<div class="card">
          <div class="name">${escapeHtml(draft.restaurantName || t("qrOrdering.scanToOrder", { defaultValue: "Scan to order" }))}</div>
          <div class="qr">${svg}</div>
          <div class="table">${escapeHtml(tableName(table))}</div>
          <div class="floor">${escapeHtml(table.floorName)}</div>
          <div class="hint">${escapeHtml(t("qrOrdering.printHint", { defaultValue: "Scan with your phone camera to see the menu, order and pay." }))}</div>
        </div>`;
      })
      .join("");
    const win = window.open("", "_blank", "width=900,height=1000");
    if (!win) {
      toast.error(t("qrOrdering.popupBlocked", { defaultValue: "Allow pop-ups to print the QR codes" }));
      return;
    }
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(t("qrOrdering.printTitle", { defaultValue: "Table QR codes" }))}</title>
      <style>
        @page { size: A4; margin: 12mm; }
        body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #111; }
        .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10mm; }
        .card { border: 1.5px dashed #999; border-radius: 6mm; padding: 8mm 6mm; text-align: center; break-inside: avoid; }
        .name { font-size: 16pt; font-weight: 700; }
        .qr { margin: 6mm auto; width: 55mm; height: 55mm; }
        .qr svg { width: 100%; height: 100%; }
        .table { font-size: 22pt; font-weight: 800; }
        .floor { font-size: 11pt; color: #555; }
        .hint { margin-top: 4mm; font-size: 10pt; color: #333; }
      </style></head><body><div class="grid">${cards}</div>
      <script>window.onload = function () { window.focus(); window.print(); };<\/script></body></html>`);
    win.document.close();
  };

  const selectedTables = (config.tables ?? []).filter((t) => selected.has(t.id));

  return (
    <div className="flex flex-col gap-6 p-5">
      <section className="flex flex-col gap-4 rounded-2xl border border-border p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t("qrOrdering.title", { defaultValue: "QR table ordering" })}</h2>
            <p className="text-sm text-muted">
              {t("qrOrdering.description", { defaultValue: "Customers scan the code on their table, order from the menu and pay online. Paid orders go straight to the kitchen screen." })}
            </p>
          </div>
          <Switch checked={draft.enabled} onChange={(e) => set("enabled", e.target.checked)}>
            {draft.enabled ? t("qrOrdering.on", { defaultValue: "On" }) : t("qrOrdering.off", { defaultValue: "Off" })}
          </Switch>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <Input label={t("qrOrdering.restaurantName", { defaultValue: "Restaurant name (shown on the menu)" })} value={draft.restaurantName} onChange={(e) => set("restaurantName", e.target.value)} />
          </div>
          <div>
            <Input label={t("qrOrdering.welcome", { defaultValue: "Welcome message" })} value={draft.welcomeText} placeholder={t("qrOrdering.welcomePlaceholder", { defaultValue: "Order and pay right here — we’ll bring it to your table." })} onChange={(e) => set("welcomeText", e.target.value)} />
          </div>

          <div>
            <label className="mb-1 block">{t("qrOrdering.orderType", { defaultValue: "Order type for QR orders" })}</label>
            <ReactSelect
              value={config.orderTypes.map(toOption).find((o) => o.value === draft.orderTypeId) ?? null}
              options={config.orderTypes.map(toOption)}
              onChange={(opt: Option | null) => set("orderTypeId", opt?.value ?? null)}
            />
          </div>
          <div>
            <label className="mb-1 block">{t("qrOrdering.orderTax", { defaultValue: "Tax added to items without their own tax (optional)" })}</label>
            <ReactSelect
              isClearable
              value={config.taxes.map((tax) => ({ label: `${tax.name} ${tax.rate}%`, value: tax.id })).find((o) => o.value === draft.orderTaxId) ?? null}
              options={config.taxes.map((tax) => ({ label: `${tax.name} ${tax.rate}%`, value: tax.id }))}
              onChange={(opt: Option | null) => set("orderTaxId", opt?.value ?? null)}
            />
          </div>

          <div>
            <label className="mb-1 block">{t("qrOrdering.paymentMethods", { defaultValue: "Online payment methods" })}</label>
            <ReactSelect
              isMulti
              value={onlineTypes.map(toOption).filter((o) => draft.paymentTypeIds.includes(o.value))}
              options={onlineTypes.map((pt) => ({ label: `${pt.name} (${pt.gateway}${pt.mode ? `, ${pt.mode}` : ""})`, value: pt.id }))}
              onChange={(opts: readonly Option[] | null) => set("paymentTypeIds", (opts ?? []).map((o) => o.value))}
              placeholder={onlineTypes.length
                ? t("qrOrdering.choosePaymentTypes", { defaultValue: "Choose Stripe / PayPal payment types" })
                : t("qrOrdering.noneSetUp", { defaultValue: "None set up yet" })}
            />
            {onlineTypes.length === 0 && (
              <p className="mt-1 text-sm text-muted">
                {t("qrOrdering.paymentHelp", { defaultValue: "To take real payments, add a payment type with the Stripe or PayPal gateway under Manage → Payment types, then pick it here." })}
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block">{t("qrOrdering.hiddenCategories", { defaultValue: "Categories hidden from customers" })}</label>
            <ReactSelect
              isMulti
              value={config.categories.map(toOption).filter((o) => hiddenIds.includes(o.value))}
              options={config.categories.map(toOption)}
              onChange={(opts: readonly Option[] | null) => set("hiddenCategoryIds", (opts ?? []).map((o) => o.value))}
            />
          </div>

          <div className="lg:col-span-2 rounded-xl border border-warning p-4">
            <Switch checked={draft.testMode} onChange={(e) => set("testMode", e.target.checked)}>
              {t("qrOrdering.testMode", { defaultValue: "Test payments — lets you try the whole flow without charging a card. Turn this off before real customers use it." })}
            </Switch>
            {draft.testMode && (
              <div className="mt-3 max-w-md">
                <label className="mb-1 block text-sm">{t("qrOrdering.testPaymentType", { defaultValue: "Record test payments as" })}</label>
                <ReactSelect
                  value={config.paymentTypes.map(toOption).find((o) => o.value === draft.testPaymentTypeId) ?? null}
                  options={config.paymentTypes.map(toOption)}
                  onChange={(opt: Option | null) => set("testPaymentTypeId", opt?.value ?? null)}
                />
              </div>
            )}
          </div>

          <div className="lg:col-span-2">
            <Input
              label={t("qrOrdering.baseUrl", { defaultValue: "Address customers’ phones use to reach this POS (goes inside the QR codes)" })}
              value={draft.baseUrl}
              onChange={(e) => set("baseUrl", e.target.value.trim())}
            />
            {isLocalHost(draft.baseUrl) && (
              <p className="mt-1 text-sm text-danger">
                {t("qrOrdering.localhostWarning", { defaultValue: "“localhost” only works on this computer. Use this computer’s network address (e.g. http://192.168.x.x:5173) or your public domain so phones can open it." })}
              </p>
            )}
          </div>

          <div className="lg:col-span-2 rounded-xl border border-border p-4">
            <label className="mb-1 block font-semibold">{t("qrOrdering.themeTitle", { defaultValue: "Customer page theme" })}</label>
            <p className="mb-3 text-sm text-muted">
              {t("qrOrdering.themeDescription", { defaultValue: "Colors for the QR ordering page. Light/dark can follow each customer’s phone." })}
            </p>
            <div className="flex flex-wrap gap-2">
              {BRAND_IDS.map((brandId) => {
                const palette = resolveBrandPalette(brandId, "light", customPrimaryValue);
                const active = (draft.themeBrand ?? "classic") === brandId;
                return (
                  <button
                    key={brandId}
                    type="button"
                    onClick={() => {
                      set("themeBrand", brandId);
                      if (brandId === "custom") set("themeCustomPrimary", customPrimaryValue);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm transition-colors",
                      active ? "border-primary bg-primary/10 font-semibold" : "border-border",
                    )}
                  >
                    <span className="flex h-4 w-4 overflow-hidden rounded-full border border-border" aria-hidden>
                      <span className="h-full w-1/2" style={{ background: `rgb(${palette.canvas})` }} />
                      <span className="h-full w-1/2" style={{ background: `rgb(${palette.primary})` }} />
                    </span>
                    {t(`settings:theme.brand.${brandId}`)}
                  </button>
                );
              })}
            </div>
            <div className="mt-4">
              <label className="mb-1 block text-sm">{t("qrOrdering.themeMode", { defaultValue: "Appearance" })}</label>
              <div className="inline-flex overflow-hidden rounded-full border border-border">
                {(["light", "dark", "system"] as const).map((mode) => {
                  const active = (draft.themeMode ?? "system") === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => set("themeMode", mode)}
                      className={cn(
                        "px-4 py-1.5 text-sm transition-colors",
                        active ? "bg-primary text-primary-fg font-semibold" : "text-muted",
                      )}
                    >
                      {t(`settings:theme.${mode}`)}
                    </button>
                  );
                })}
              </div>
            </div>

            {draft.themeBrand === "custom" && (
              <div className="mt-4 rounded-xl border border-border bg-surface p-4">
                <p className="mb-3 text-sm text-muted">{t("settings:theme.customDescription")}</p>
                <div className="flex flex-wrap items-end gap-3">
                  <div>
                    <label className="form-label" htmlFor="so-theme-custom-color">{t("settings:theme.customPrimary")}</label>
                    <Input
                      id="so-theme-custom-color"
                      type="color"
                      className="h-12 w-16 cursor-pointer p-1"
                      value={customPrimaryValue}
                      onChange={(e) => applyCustomPrimary(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[9rem] flex-1">
                    <label className="form-label" htmlFor="so-theme-custom-hex">{t("settings:theme.customHex")}</label>
                    <Input
                      id="so-theme-custom-hex"
                      type="text"
                      value={customHexDraft}
                      placeholder={DEFAULT_CUSTOM_PRIMARY}
                      onChange={(e) => setCustomHexDraft(e.target.value)}
                      onBlur={() => applyCustomPrimary(customHexDraft)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") applyCustomPrimary(customHexDraft);
                      }}
                    />
                  </div>
                  <Button type="button" variant="primary" filled onClick={() => applyCustomPrimary(customHexDraft)}>
                    {t("settings:theme.customApply")}
                  </Button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">{t("settings:theme.customPreview")}</span>
                  {[customPreview.primary, customPreview.surface, customPreview.canvas, customPreview.border].map((channels, index) => (
                    <span
                      key={index}
                      className="inline-block h-6 w-6 rounded-md border border-border"
                      style={{ backgroundColor: rgbChannelsToHex(channels) }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {!draft.orderTypeId && <p className="text-sm text-danger">{t("qrOrdering.orderTypeRequired", { defaultValue: "Choose an order type (e.g. Dine In) before turning QR ordering on." })}</p>}
        {!paymentReady && <p className="text-sm text-danger">{t("qrOrdering.paymentRequired", { defaultValue: "Pick at least one online payment method (or turn on test payments) — customers must pay before the order is sent." })}</p>}

        <div>
          <Button variant="primary" onClick={save} isLoading={saving} disabled={saving}>{t("qrOrdering.saveSettings", { defaultValue: "Save settings" })}</Button>
        </div>
      </section>

      {config.paidAwaitingPos.length > 0 && (
        <section className="rounded-2xl border border-danger p-5">
          <h3 className="font-bold text-danger">{t("qrOrdering.paidAwaitingPos", { defaultValue: "Paid QR orders that did not reach the POS" })}</h3>
          <ul className="mt-2 flex flex-col gap-2">
            {config.paidAwaitingPos.map((row) => (
              <li key={row.id} className="flex flex-wrap items-center gap-3 text-sm">
                <span>{new Date(row.createdAt).toLocaleString()} — {row.total}</span>
                {row.error && <span className="text-muted">{row.error}</span>}
                <Button
                  size="sm"
                  variant="primary"
                  onClick={async () => {
                    try {
                      const res = await selfOrderAdmin.retryCheckout(row.id);
                      toast.success(t("qrOrdering.sentToPos", { defaultValue: "Sent to POS as order #{{number}}", number: res.orderNumber ?? "" }));
                      void load();
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : String(err));
                    }
                  }}
                >
                  {t("qrOrdering.sendToPosAgain", { defaultValue: "Send to POS again" })}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">{t("qrOrdering.tableCodes", { defaultValue: "Table QR codes ({{count}})", count: config.tables.length })}</h3>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() => setSelected(selected.size === config.tables.length ? new Set() : new Set(config.tables.map((tbl) => tbl.id)))}
            >
              {selected.size === config.tables.length
                ? t("qrOrdering.clearSelection", { defaultValue: "Clear selection" })
                : t("qrOrdering.selectAll", { defaultValue: "Select all" })}
            </Button>
            <Button
              variant="primary"
              icon={faPrint}
              disabled={selectedTables.length === 0}
              onClick={() => printCodes(selectedTables)}
            >
              {t("qrOrdering.printSelected", { defaultValue: "Print QR codes ({{count}})", count: selectedTables.length })}
            </Button>
          </div>
        </div>

        {floors.map(([floor, tables]) => (
          <div key={floor}>
            <h4 className="mb-2 font-semibold text-muted">{floor}</h4>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {tables.map((table) => {
                const link = selfOrderLink(draft.baseUrl, table.token);
                return (
                  <div
                    key={table.id}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 ${selected.has(table.id) ? "border-primary" : "border-border"} ${table.enabled ? "" : "opacity-50"}`}
                  >
                    <div className="flex w-full items-center justify-between">
                      <Checkbox
                        checked={selected.has(table.id)}
                        onChange={() =>
                          setSelected((prev) => {
                            const next = new Set(prev);
                            if (next.has(table.id)) next.delete(table.id);
                            else next.add(table.id);
                            return next;
                          })
                        }
                      />
                      <span className="font-bold">{tableName(table)}</span>
                      <Switch checked={table.enabled} onChange={(e) => void updateTable(table, { enabled: e.target.checked })} />
                    </div>
                    <div
                      className="rounded-xl bg-white p-3"
                      ref={(el) => {
                        if (el) qrRefs.current.set(table.id, el);
                        else qrRefs.current.delete(table.id);
                      }}
                    >
                      <QRCode value={link} size={148} />
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={faCopy} onClick={() => void navigator.clipboard?.writeText(link).then(() => toast.success(t("qrOrdering.linkCopied", { defaultValue: "Link copied" })), () => toast.error(t("qrOrdering.copyFailed", { defaultValue: "Could not copy the link" })))}>
                        {t("qrOrdering.copyLink", { defaultValue: "Copy link" })}
                      </Button>
                      <Button size="sm" variant="secondary" icon={faUpRightFromSquare} onClick={() => window.open(link, "_blank", "noopener,noreferrer")}>
                        {t("qrOrdering.open", { defaultValue: "Open" })}
                      </Button>
                      <DeleteConfirm
                        title={t("qrOrdering.newQr", { defaultValue: "New QR code" })}
                        message={t("qrOrdering.regenerateConfirm", { defaultValue: "Make a new QR code for {{table}}? The old printed code will stop working.", table: tableName(table) })}
                        onConfirm={() => updateTable(table, { regenerate: true })}
                      >
                        <Button size="sm" variant="secondary" iconButton aria-label={t("qrOrdering.newQr", { defaultValue: "New QR code" })}>
                          <FontAwesomeIcon icon={faArrowsRotate} />
                        </Button>
                      </DeleteConfirm>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
