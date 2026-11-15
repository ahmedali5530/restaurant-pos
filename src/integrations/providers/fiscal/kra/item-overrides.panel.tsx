import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useDB } from '@/api/db/db.ts';
import { Tables } from '@/api/db/tables.ts';
import { Input } from '@/components/common/input/input.tsx';
import { ReactSelect } from '@/components/common/input/custom.react.select.tsx';
import { Button } from '@/components/common/input/button.tsx';
import { EntityMappingRepository } from '@/integrations/accounting/external/entity-mapping-repository.ts';
import { kraTenantId } from '@/integrations/providers/fiscal/kra/config.ts';
import { KRA_PROVIDER_ID } from '@/integrations/providers/fiscal/kra/submit.ts';
import {
  isKraItemRegistered,
  kraItemPayload,
  kraPendingExternalId,
} from '@/integrations/providers/fiscal/kra/item-mapping.ts';

type DishRow = {
  id: string;
  name?: string;
  number?: string;
};

type DraftRow = {
  posrId: string;
  name: string;
  number: string;
  itemClsCd: string;
  taxTyCd: string;
  registered: boolean;
  itemCd: string;
  dirty: boolean;
};

type TaxOption = { label: string; value: string };

const TAX_OPTIONS: TaxOption[] = [
  { label: '—', value: '' },
  { label: 'A', value: 'A' },
  { label: 'B', value: 'B' },
  { label: 'C', value: 'C' },
  { label: 'D', value: 'D' },
  { label: 'E', value: 'E' },
];

type KraItemOverridesPanelProps = {
  tin: string;
  bhfId: string;
  enabled: boolean;
};

export const KraItemOverridesPanel = ({
  tin,
  bhfId,
  enabled,
}: KraItemOverridesPanelProps) => {
  const { t } = useTranslation('integrations');
  const db = useDB();
  const [rows, setRows] = useState<DraftRow[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const tenantId = useMemo(() => {
    if (!tin || !bhfId) return '';
    return kraTenantId({ tin, bhfId });
  }, [tin, bhfId]);

  useEffect(() => {
    let mounted = true;
    if (!enabled || !tenantId) {
      setRows([]);
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      try {
        const [dishes] = await db.query<DishRow[]>(
          `SELECT id, name, number FROM ${Tables.dishes}
           WHERE (deleted_at = NONE OR deleted_at = NULL)
           ORDER BY name
           LIMIT 500`
        );
        const repo = new EntityMappingRepository(db as any);
        const mappings = await repo.listByProvider(KRA_PROVIDER_ID, tenantId, 'item');
        const byPosr = new Map(mappings.map((m) => [String(m.posrId), m]));
        const next: DraftRow[] = (Array.isArray(dishes) ? dishes : []).map((dish) => {
          const posrId = String(dish.id);
          const mapping = byPosr.get(posrId);
          const payload = kraItemPayload(mapping);
          const registered = mapping ? isKraItemRegistered(mapping) : false;
          return {
            posrId,
            name: String(dish.name || ''),
            number: String(dish.number || ''),
            itemClsCd: payload.itemClsCd ? String(payload.itemClsCd) : '',
            taxTyCd: payload.taxTyCd ? String(payload.taxTyCd) : '',
            registered,
            itemCd: registered ? String(mapping?.externalId || '') : '',
            dirty: false,
          };
        });
        if (mounted) setRows(next);
      } catch (err: any) {
        if (mounted) toast.error(err?.message || t('kraItemOverridesLoadFailed'));
      } finally {
        if (mounted) setLoading(false);
      }
    };

    void load();
    return () => {
      mounted = false;
    };
    // Never put db in deps — useDB() returns a new object each render.
  }, [enabled, tenantId]);

  const visibleRows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(q) ||
        row.number.toLowerCase().includes(q) ||
        row.itemCd.toLowerCase().includes(q)
    );
  }, [filter, rows]);

  const dirtyCount = rows.filter((row) => row.dirty).length;

  const updateRow = (posrId: string, patch: Partial<DraftRow>) => {
    setRows((prev) =>
      prev.map((row) =>
        row.posrId === posrId ? { ...row, ...patch, dirty: true } : row
      )
    );
  };

  const saveDirty = async () => {
    if (!tenantId || dirtyCount === 0) return;
    setSaving(true);
    try {
      const repo = new EntityMappingRepository(db as any);
      const dirty = rows.filter((row) => row.dirty);
      for (const row of dirty) {
        const existing = await repo.findByPosrId(
          KRA_PROVIDER_ID,
          tenantId,
          'item',
          row.posrId
        );
        const registered = existing ? isKraItemRegistered(existing) : false;
        const externalId = registered
          ? String(existing?.externalId || '')
          : kraPendingExternalId(row.posrId);
        const itemClsCd = row.itemClsCd.trim() || null;
        const taxTyCd = row.taxTyCd.trim().toUpperCase() || null;
        await repo.save({
          providerId: KRA_PROVIDER_ID,
          tenantId,
          entityType: 'item',
          posrId: row.posrId,
          externalId,
          externalPayload: {
            itemClsCd,
            taxTyCd,
            registered,
          },
        });
      }
      toast.success(t('kraItemOverridesSaved'));

      // Reload without putting db in an effect dependency.
      setLoading(true);
      try {
        const [dishes] = await db.query<DishRow[]>(
          `SELECT id, name, number FROM ${Tables.dishes}
           WHERE deleted_at = NONE
           ORDER BY name
           LIMIT 500`
        );
        const mappings = await repo.listByProvider(KRA_PROVIDER_ID, tenantId, 'item');
        const byPosr = new Map(mappings.map((m) => [String(m.posrId), m]));
        setRows(
          (Array.isArray(dishes) ? dishes : []).map((dish) => {
            const posrId = String(dish.id);
            const mapping = byPosr.get(posrId);
            const payload = kraItemPayload(mapping);
            const registered = mapping ? isKraItemRegistered(mapping) : false;
            return {
              posrId,
              name: String(dish.name || ''),
              number: String(dish.number || ''),
              itemClsCd: payload.itemClsCd ? String(payload.itemClsCd) : '',
              taxTyCd: payload.taxTyCd ? String(payload.taxTyCd) : '',
              registered,
              itemCd: registered ? String(mapping?.externalId || '') : '',
              dirty: false,
            };
          })
        );
      } finally {
        setLoading(false);
      }
    } catch (err: any) {
      toast.error(err?.message || t('kraItemOverridesSaveFailed'));
    } finally {
      setSaving(false);
    }
  };

  if (!enabled) return null;

  return (
    <div className="mb-6 p-4 border border-border rounded-lg bg-surface" data-testid="kra-item-overrides">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div className="min-w-0">
          <p className="font-medium text-sm">{t('kraItemOverridesTitle')}</p>
          <p className="text-xs text-muted mt-0.5">{t('kraItemOverridesHint')}</p>
        </div>
        <Button
          variant="primary"
          onClick={() => void saveDirty()}
          disabled={saving || dirtyCount === 0 || !tenantId}
        >
          {saving ? t('kraItemOverridesSaving') : t('kraItemOverridesSave')}
        </Button>
      </div>

      {!tenantId ? (
        <p className="text-sm text-muted">{t('kraItemOverridesNeedTin')}</p>
      ) : (
        <>
          <div className="mb-3 max-w-sm">
            <div>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('kraItemOverridesFilter')}
              />
            </div>
          </div>

          {loading ? (
            <p className="text-sm text-muted">{t('kraItemOverridesLoading')}</p>
          ) : visibleRows.length === 0 ? (
            <p className="text-sm text-muted">{t('kraItemOverridesEmpty')}</p>
          ) : (
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-muted border-b border-border">
                    <th className="py-2 pr-3 font-medium">{t('kraItemOverridesDish')}</th>
                    <th className="py-2 pr-3 font-medium">{t('kraItemClsCd')}</th>
                    <th className="py-2 pr-3 font-medium">{t('kraTaxTyCd')}</th>
                    <th className="py-2 font-medium">{t('kraItemOverridesStatus')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const taxOption =
                      TAX_OPTIONS.find((opt) => opt.value === row.taxTyCd) ?? TAX_OPTIONS[0];
                    return (
                      <tr key={row.posrId} className="border-b border-border/60 align-top">
                        <td className="py-2 pr-3">
                          <div className="font-medium">{row.name || row.number || row.posrId}</div>
                          <div className="text-xs text-muted">
                            {row.number}
                            {row.itemCd ? ` · ${row.itemCd}` : ''}
                          </div>
                        </td>
                        <td className="py-2 pr-3 min-w-[10rem]">
                          <div>
                            <Input
                              value={row.itemClsCd}
                              onChange={(e) =>
                                updateRow(row.posrId, { itemClsCd: e.target.value })
                              }
                              placeholder={t('kraItemClsCdPlaceholder')}
                            />
                          </div>
                        </td>
                        <td className="py-2 pr-3 min-w-[8rem]">
                          <div>
                            <ReactSelect<TaxOption, false>
                              options={TAX_OPTIONS}
                              value={taxOption}
                              onChange={(opt) =>
                                updateRow(row.posrId, { taxTyCd: opt?.value ?? '' })
                              }
                            />
                          </div>
                        </td>
                        <td className="py-2">
                          <span className="text-xs text-muted">
                            {row.registered
                              ? t('kraItemOverridesRegistered')
                              : t('kraItemOverridesPending')}
                            {row.dirty ? ` · ${t('kraItemOverridesDirty')}` : ''}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
};
