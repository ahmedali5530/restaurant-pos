/**
 * KDS Settings panel — operator-tunable KDS configuration.
 *
 * All values are read/written to the `settings` table via SurQL merge.
 * Defaults are sensible for a fast-casual restaurant; fine-dining may want
 * longer thresholds.
 */

import { useState, useEffect, useCallback } from 'react';
import { useDB } from '@/api/db/db.ts';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faRotateRight, faKeyboard, faVolumeHigh, faGaugeHigh } from '@fortawesome/free-solid-svg-icons';
import { Button } from '@/components/common/input/button.tsx';
import {
  DEFAULT_KDS_CONFIG,
  DEFAULT_KEYMAP,
  type KdsConfig,
} from '@/lib/kitchen/kds.service.ts';

const SECTION = 'border-b border-neutral-100 py-5 last:border-b-0';

const Row = ({
  label,
  hint,
  children,
}: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-start justify-between gap-4 py-2">
    <div className="flex-1">
      <div className="font-medium text-sm">{label}</div>
      {hint && <div className="text-xs text-neutral-500 mt-0.5">{hint}</div>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const Toggle = ({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) => (
  <button
    type="button"
    onClick={() => onChange(!checked)}
    className={`w-12 h-6 rounded-full transition-colors relative ${checked ? 'bg-emerald-500' : 'bg-neutral-300'}`}
    role="switch"
    aria-checked={checked}
  >
    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${checked ? 'translate-x-6' : ''}`} />
  </button>
);

export function KdsSettingsPanel() {
  const { t } = useTranslation(['admin', 'common']);
  const db = useDB();
  const [config, setConfig] = useState<KdsConfig>(DEFAULT_KDS_CONFIG);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadConfig = useCallback(async () => {
    try {
      const result = await db.query<any>('SELECT * FROM settings LIMIT 1');
      const rows = Array.isArray(result) ? result.flat() : [];
      const settings = rows[0] ?? {};
      // Merge DB values over defaults
      setConfig({
        agingThresholds: {
          freshMinutes: settings.kds_fresh_minutes ?? DEFAULT_KDS_CONFIG.agingThresholds.freshMinutes,
          agingMinutes: settings.kds_aging_minutes ?? DEFAULT_KDS_CONFIG.agingThresholds.agingMinutes,
          criticalMinutes: settings.kds_critical_minutes ?? DEFAULT_KDS_CONFIG.agingThresholds.criticalMinutes,
        },
        soundEnabled: settings.kds_sound_enabled ?? DEFAULT_KDS_CONFIG.soundEnabled,
        bumpBarEnabled: settings.kds_bumpbar_enabled ?? DEFAULT_KDS_CONFIG.bumpBarEnabled,
        expeditorMode: settings.kds_expeditor_mode ?? DEFAULT_KDS_CONFIG.expeditorMode,
        autoBumpWhenAllReady: settings.kds_auto_bump ?? DEFAULT_KDS_CONFIG.autoBumpWhenAllReady,
        recallUndoWindowSeconds: settings.kds_recall_window_seconds ?? DEFAULT_KDS_CONFIG.recallUndoWindowSeconds,
        showStationNames: settings.kds_show_station_names ?? DEFAULT_KDS_CONFIG.showStationNames,
        compactMode: settings.kds_compact_mode ?? DEFAULT_KDS_CONFIG.compactMode,
      });
    } catch (err) {
      console.error('[kds-settings] load failed', err);
      // Keep defaults
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await db.query(
        `UPDATE settings SET
           kds_fresh_minutes = $fresh,
           kds_aging_minutes = $aging,
           kds_critical_minutes = $critical,
           kds_sound_enabled = $sound,
           kds_bumpbar_enabled = $bumpbar,
           kds_expeditor_mode = $exp,
           kds_auto_bump = $auto,
           kds_recall_window_seconds = $recall,
           kds_show_station_names = $show,
           kds_compact_mode = $compact
         LIMIT 1`,
        {
          fresh: config.agingThresholds.freshMinutes,
          aging: config.agingThresholds.agingMinutes,
          critical: config.agingThresholds.criticalMinutes,
          sound: config.soundEnabled,
          bumpbar: config.bumpBarEnabled,
          exp: config.expeditorMode,
          auto: config.autoBumpWhenAllReady,
          recall: config.recallUndoWindowSeconds,
          show: config.showStationNames,
          compact: config.compactMode,
        }
      );
      toast.success('KDS settings saved');
    } catch (err) {
      console.error('[kds-settings] save failed', err);
      toast.error('Failed to save KDS settings');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(DEFAULT_KDS_CONFIG);
    toast.info('Settings reset to defaults — click Save to apply');
  };

  if (loading) {
    return <div className="p-6 text-neutral-400">Loading KDS settings…</div>;
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <FontAwesomeIcon icon={faGaugeHigh} className="text-amber-600" />
            Kitchen Display System
          </h2>
          <p className="text-sm text-neutral-500">
            Tune aging thresholds, bump-bar, and expeditor mode
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={handleReset} variant="custom" className="border border-neutral-300 px-3 py-2 text-sm">
            <FontAwesomeIcon icon={faRotateRight} className="mr-1" /> Reset
          </Button>
          <Button onClick={handleSave} variant="primary" disabled={saving} className="px-4 py-2 text-sm">
            <FontAwesomeIcon icon={faCheck} className="mr-1" /> {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>

      {/* Aging thresholds */}
      <section className="bg-white rounded-lg border border-neutral-200 px-5 py-2">
        <h3 className="font-medium py-3 border-b border-neutral-100">Aging thresholds</h3>
        <div className={SECTION}>
          <Row label="Fresh (green)" hint="Orders younger than this stay green">
            <input
              type="number"
              min={1}
              max={60}
              value={config.agingThresholds.freshMinutes}
              onChange={e => setConfig(c => ({
                ...c,
                agingThresholds: { ...c.agingThresholds, freshMinutes: parseInt(e.target.value) || 5 },
              }))}
              className="w-20 px-2 py-1 border border-neutral-300 rounded text-right"
            />
            <span className="ml-2 text-sm text-neutral-500">min</span>
          </Row>
          <Row label="Aging (yellow)" hint="Orders turn yellow at this age">
            <input
              type="number"
              min={2}
              max={120}
              value={config.agingThresholds.agingMinutes}
              onChange={e => setConfig(c => ({
                ...c,
                agingThresholds: { ...c.agingThresholds, agingMinutes: parseInt(e.target.value) || 10 },
              }))}
              className="w-20 px-2 py-1 border border-neutral-300 rounded text-right"
            />
            <span className="ml-2 text-sm text-neutral-500">min</span>
          </Row>
          <Row label="Critical (red)" hint="Orders turn red at this age — beyond this they flash">
            <input
              type="number"
              min={5}
              max={240}
              value={config.agingThresholds.criticalMinutes}
              onChange={e => setConfig(c => ({
                ...c,
                agingThresholds: { ...c.agingThresholds, criticalMinutes: parseInt(e.target.value) || 15 },
              }))}
              className="w-20 px-2 py-1 border border-neutral-300 rounded text-right"
            />
            <span className="ml-2 text-sm text-neutral-500">min</span>
          </Row>
        </div>
        {/* Visual preview of thresholds */}
        <div className="py-3 flex gap-1 h-6 rounded overflow-hidden">
          <div className="bg-emerald-400 flex items-center justify-center text-xs text-white" style={{ width: `${(config.agingThresholds.freshMinutes / config.agingThresholds.criticalMinutes) * 100}%` }}>Fresh</div>
          <div className="bg-amber-400 flex items-center justify-center text-xs text-white flex-1">Aging</div>
          <div className="bg-rose-500 flex items-center justify-center text-xs text-white flex-1">Critical</div>
        </div>
      </section>

      {/* Behavior */}
      <section className="bg-white rounded-lg border border-neutral-200 px-5 py-2 mt-4">
        <h3 className="font-medium py-3 border-b border-neutral-100 flex items-center gap-2">
          <FontAwesomeIcon icon={faKeyboard} /> Behavior
        </h3>
        <div className={SECTION}>
          <Row label="Bump-bar keyboard navigation" hint="Navigate + bump orders with arrow keys + Enter (no touch)">
            <Toggle checked={config.bumpBarEnabled} onChange={v => setConfig(c => ({ ...c, bumpBarEnabled: v }))} />
          </Row>
          <Row label="Sound on new order" hint="Play audio chime when a new ticket arrives">
            <Toggle checked={config.soundEnabled} onChange={v => setConfig(c => ({ ...c, soundEnabled: v }))} />
          </Row>
          <Row label="Expeditor mode" hint="Combine all stations into one board (default per-station)">
            <Toggle checked={config.expeditorMode} onChange={v => setConfig(c => ({ ...c, expeditorMode: v }))} />
          </Row>
          <Row label="Auto-bump when all items ready" hint="Auto-clear ticket once every item is completed">
            <Toggle checked={config.autoBumpWhenAllReady} onChange={v => setConfig(c => ({ ...c, autoBumpWhenAllReady: v }))} />
          </Row>
          <Row label="Show station names" hint="Display kitchen name on each ticket card">
            <Toggle checked={config.showStationNames} onChange={v => setConfig(c => ({ ...c, showStationNames: v }))} />
          </Row>
          <Row label="Compact mode" hint="Smaller cards — more tickets visible per screen">
            <Toggle checked={config.compactMode} onChange={v => setConfig(c => ({ ...c, compactMode: v }))} />
          </Row>
          <Row label="Recall undo window" hint="Time during which a bumped ticket can be recalled (undo)">
            <input
              type="number"
              min={5}
              max={300}
              value={config.recallUndoWindowSeconds}
              onChange={e => setConfig(c => ({ ...c, recallUndoWindowSeconds: parseInt(e.target.value) || 30 }))}
              className="w-20 px-2 py-1 border border-neutral-300 rounded text-right"
            />
            <span className="ml-2 text-sm text-neutral-500">sec</span>
          </Row>
        </div>
      </section>

      {/* Bump-bar keymap reference */}
      <section className="bg-white rounded-lg border border-neutral-200 px-5 py-2 mt-4">
        <h3 className="font-medium py-3 border-b border-neutral-100 flex items-center gap-2">
          <FontAwesomeIcon icon={faKeyboard} />Bump-bar keymap reference
        </h3>
        <div className="py-4 grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
          {[
            { key: '← / →', action: 'Navigate tickets' },
            { key: '↑ / ↓', action: 'Navigate stations (expeditor)' },
            { key: 'Enter / Space', action: 'Bump current ticket' },
            { key: 'Backspace', action: 'Recall current' },
            { key: 'R', action: 'Recall last bumped' },
            { key: 'E', action: 'Toggle expeditor view' },
            { key: 'M', action: 'Mute / unmute sound' },
            { key: 'F5', action: 'Refresh board' },
          ].map(item => (
            <div key={item.key} className="flex items-center gap-2">
              <kbd className="px-2 py-1 bg-neutral-100 border border-neutral-300 rounded text-xs font-mono">{item.key}</kbd>
              <span className="text-neutral-600">{item.action}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-neutral-500 mt-2">
          Tip: pair a $15 USB numeric keypad with a tablet for a Toast-equivalent bump-bar at 1/10 the cost.
        </p>
      </section>
    </div>
  );
}

export default KdsSettingsPanel;
