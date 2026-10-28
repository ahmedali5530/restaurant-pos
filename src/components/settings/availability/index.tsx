import {useCallback, useEffect, useMemo, useState} from "react";
import {useSetAtom} from "jotai";
import {useTranslation} from "react-i18next";
import {toast} from "sonner";
import {appSettings} from "@/store/jotai.ts";
import {useDB} from "@/api/db/db.ts";
import {Dish} from "@/api/model/dish.ts";
import {Category} from "@/api/model/category.ts";
import {Button} from "@/components/common/input/button.tsx";
import {Input} from "@/components/common/input/input.tsx";
import {Switch} from "@/components/common/input/switch.tsx";
import {Checkbox} from "@/components/common/input/checkbox.tsx";
import {cn, toRecordId} from "@/lib/utils.ts";
import {
  applyAvailabilityLocally,
  buildAvailabilityPatch,
} from "@/lib/dish-availability.ts";
import {faCheck, faBan, faHashtag, faInfinity} from "@fortawesome/free-solid-svg-icons";
import useApi, {SettingsData} from "@/api/db/use.api.ts";
import {Tables} from "@/api/db/tables.ts";
import {Loader} from "@/components/common/loader/loader.tsx";

const dishInCategory = (dish: Dish, categoryId: string | null): boolean => {
  if (!categoryId) {
    return true;
  }
  return (dish.categories ?? []).some((c) => String(c.id) === categoryId);
};

const formatSaleLimit = (value: unknown): string => {
  if (value == null || value === "") {
    return "—";
  }
  const n = Number(value);
  return Number.isFinite(n) ? String(n) : "—";
};

export const AdminAvailability = () => {
  const {t} = useTranslation(["admin", "common", "toast"]);
  const db = useDB();
  const setSettings = useSetAtom(appSettings);

  const dishesHook = useApi<SettingsData<Dish>>(
    Tables.dishes,
    [`deleted_at = none`],
    ["priority asc", "name asc"],
    0,
    99999,
    ["categories"],
  );
  const categoriesHook = useApi<SettingsData<Category>>(
    Tables.categories,
    [`deleted_at = none`],
    ["priority asc", "name asc"],
    0,
    99999,
  );

  const dishes = dishesHook.data?.data ?? [];
  const categories = categoriesHook.data?.data ?? [];
  const loading = dishesHook.isFetching || categoriesHook.isFetching;

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkQty, setBulkQty] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [applyCategoryMode, setApplyCategoryMode] = useState(false);

  const filtered = useMemo(
    () => dishes.filter((d) => dishInCategory(d, categoryId)),
    [dishes, categoryId],
  );

  useEffect(() => {
    setSelected(new Set());
  }, [categoryId]);

  // Push live Surreal availability into FOH catalog (covers prior saves before local patch).
  useEffect(() => {
    if (!dishes.length || dishesHook.isFetching) {
      return;
    }
    void applyAvailabilityLocally({
      patches: dishes.map((d) => ({
        id: String(d.id),
        available: d.available,
        available_qty: d.available_qty ?? null,
        available_qty_set_at: d.available_qty_set_at ?? null,
      })),
      setAppSettings: setSettings,
    }).catch(() => undefined);
  }, [dishes, dishesHook.isFetching, setSettings]);

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(filtered.map((d) => String(d.id))));
  };

  const toggleOne = (id: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(id);
      } else {
        next.delete(id);
      }
      return next;
    });
  };

  const targetDishes = useMemo(() => {
    if (applyCategoryMode && categoryId) {
      return filtered;
    }
    return filtered.filter((d) => selected.has(String(d.id)));
  }, [applyCategoryMode, categoryId, filtered, selected]);

  const refetchDishes = dishesHook.fetchData;

  const persistPatch = useCallback(
    async (list: Dish[], patchBuilder: (dish: Dish) => Record<string, any>) => {
      if (list.length === 0) {
        toast.warning(t("admin:availability.selectDishes"));
        return;
      }
      setSaving(true);
      try {
        const localPatches: Array<{id: string} & Record<string, any>> = [];
        for (const dish of list) {
          const id = String(dish.id);
          const patch = patchBuilder(dish);
          await db.merge(toRecordId(id), patch);
          localPatches.push({id, ...patch});
        }
        await applyAvailabilityLocally({
          patches: localPatches,
          setAppSettings: setSettings,
        });
        await refetchDishes();
        toast.success(t("admin:availability.saved", {count: list.length}));
        setSelected(new Set());
        setApplyCategoryMode(false);
      } catch (error) {
        console.error(error);
        toast.error(t("toast:admin.saveFailed", {defaultValue: "Save failed"}));
      } finally {
        setSaving(false);
      }
    },
    [refetchDishes, setSettings, t],
  );

  const markAvailable = (value: boolean) => {
    void persistPatch(targetDishes, () => buildAvailabilityPatch({available: value}));
  };

  const setSaleLimit = () => {
    if (bulkQty.trim() === "") {
      toast.warning(t("admin:availability.enterQty"));
      return;
    }
    const qty = Number(bulkQty);
    if (!Number.isFinite(qty) || qty < 0) {
      toast.warning(t("admin:availability.enterQty"));
      return;
    }
    void persistPatch(targetDishes, () =>
      buildAvailabilityPatch({available_qty: qty, stampNow: true}),
    );
  };

  const clearSaleLimit = () => {
    void persistPatch(targetDishes, () =>
      buildAvailabilityPatch({available_qty: null}),
    );
  };

  const allSelected =
    filtered.length > 0 && filtered.every((d) => selected.has(String(d.id)));

  return (
    <div className="flex flex-col gap-4 p-2" data-testid="admin-availability">
      <div>
        <h2 className="text-xl font-semibold text-foreground">{t("admin:availability.title")}</h2>
        <p className="text-sm text-muted">{t("admin:availability.description")}</p>
      </div>

      <div className="flex flex-wrap gap-2" data-testid="admin-availability-categories">
        <button
          type="button"
          className={cn(
            "pressable rounded-full px-4 h-12 border-2",
            categoryId == null ? "bg-gradient border-transparent" : "bg-surface-elevated border-transparent",
          )}
          onClick={() => setCategoryId(null)}
        >
          {t("admin:availability.allCategories")}
        </button>
        {categories.map((cat: Category) => (
          <button
            key={String(cat.id)}
            type="button"
            className={cn(
              "pressable rounded-full px-4 h-12 border-2",
              String(cat.id) === categoryId
                ? "bg-gradient border-transparent"
                : "bg-surface-elevated border-transparent",
            )}
            onClick={() => setCategoryId(String(cat.id))}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-surface-elevated border border-border p-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center min-h-12">
            <Checkbox
              checked={allSelected}
              indeterminate={!allSelected && selected.size > 0}
              label={t("admin:availability.selectAll")}
              onChange={(e) => toggleAll(Boolean((e.target as HTMLInputElement).checked))}
            />
          </div>
          <div className="flex items-center min-h-12">
            <Switch
              checked={applyCategoryMode}
              disabled={!categoryId}
              onChange={(e) => setApplyCategoryMode((e.target as HTMLInputElement).checked)}
            >
              {t("admin:availability.applyToCategory")}
            </Switch>
          </div>
          <div className="text-sm text-muted flex items-center min-h-12">
            {applyCategoryMode && categoryId
              ? t("admin:availability.targetsCategory", {count: filtered.length})
              : t("admin:availability.targetsSelected", {count: selected.size})}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="success"
            icon={faCheck}
            disabled={saving}
            onClick={() => markAvailable(true)}
            data-testid="availability-mark-available"
          >
            {t("admin:availability.markAvailable")}
          </Button>
          <Button
            variant="danger"
            icon={faBan}
            disabled={saving}
            onClick={() => markAvailable(false)}
            data-testid="availability-mark-unavailable"
          >
            {t("admin:availability.markUnavailable")}
          </Button>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted whitespace-nowrap">
              {t("admin:availability.saleLimit")}
            </span>
            <Input
              type="number"
              value={bulkQty}
              onChange={(e) => setBulkQty(e.target.value)}
              className="!w-24"
              placeholder="0"
            />
          </div>
          <Button
            variant="primary"
            icon={faHashtag}
            disabled={saving}
            onClick={setSaleLimit}
            data-testid="availability-set-qty"
          >
            {t("admin:availability.setLimit")}
          </Button>
          <Button
            variant="secondary"
            icon={faInfinity}
            disabled={saving}
            onClick={clearSaleLimit}
            data-testid="availability-clear-qty"
          >
            {t("admin:availability.clearLimit")}
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-surface relative min-h-[200px]">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-surface/60">
            <Loader />
          </div>
        )}
        <div className="grid grid-cols-[48px_1fr_120px_120px] gap-2 px-3 py-2 bg-surface-elevated text-sm font-semibold border-b border-border">
          <span />
          <span>{t("admin:columns.name")}</span>
          <span>{t("admin:columns.available")}</span>
          <span>{t("admin:columns.availableQty")}</span>
        </div>
        <div className="max-h-[55vh] overflow-auto">
          {!loading && filtered.length === 0 ? (
            <div className="p-6 text-center text-muted">{t("admin:availability.empty")}</div>
          ) : (
            filtered.map((dish) => {
              const id = String(dish.id);
              return (
                <div
                  key={id}
                  className="grid grid-cols-[48px_1fr_120px_120px] gap-2 px-3 py-3 items-center border-b border-border last:border-0"
                  data-testid={`availability-row-${id}`}
                >
                  <Checkbox
                    checked={selected.has(id)}
                    onChange={(e) =>
                      toggleOne(id, Boolean((e.target as HTMLInputElement).checked))
                    }
                    aria-label={dish.name}
                  />
                  <div className="min-w-0">
                    <div className="font-medium truncate">{dish.name}</div>
                    <div className="text-xs text-muted truncate">#{dish.number}</div>
                  </div>
                  <div>
                    {dish.available === false
                      ? t("admin:availability.unavailable")
                      : t("admin:availability.available")}
                  </div>
                  <div>{formatSaleLimit(dish.available_qty)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
