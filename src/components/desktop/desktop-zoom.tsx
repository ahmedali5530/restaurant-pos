import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/common/input/button.tsx';
import { isTauriDesktop } from '@/lib/desktop.ts';
import {
  DESKTOP_ZOOM_EVENT,
  DESKTOP_ZOOM_MAX,
  DESKTOP_ZOOM_MIN,
  DESKTOP_ZOOM_STEP,
  applySavedDesktopZoom,
  bumpDesktopZoom,
  readDesktopZoom,
  setDesktopZoom,
} from '@/lib/desktop-zoom.ts';

function useDesktopZoom(): number {
  const [zoom, setZoom] = useState(readDesktopZoom);
  useEffect(() => {
    const onChange = (event: Event) => {
      const detail = (event as CustomEvent<number>).detail;
      if (typeof detail === 'number') setZoom(detail);
    };
    window.addEventListener(DESKTOP_ZOOM_EVENT, onChange);
    return () => window.removeEventListener(DESKTOP_ZOOM_EVENT, onChange);
  }, []);
  return zoom;
}

/** Applies the saved size and handles Ctrl/Cmd plus, minus, and zero. */
export function DesktopZoomController() {
  useEffect(() => {
    if (!isTauriDesktop()) return;
    void applySavedDesktopZoom();

    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const zoomIn = event.key === '+' || event.key === '=' || event.code === 'NumpadAdd';
      const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract';
      const reset = event.key === '0' || event.code === 'Numpad0';
      if (!zoomIn && !zoomOut && !reset) return;
      event.preventDefault();
      if (reset) setDesktopZoom(1);
      else if (zoomIn) bumpDesktopZoom(DESKTOP_ZOOM_STEP);
      else bumpDesktopZoom(-DESKTOP_ZOOM_STEP);
    };

    let wheelBudget = 0;
    const onWheel = (event: WheelEvent) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      wheelBudget += event.deltaY;
      if (Math.abs(wheelBudget) < 40) return;
      const direction = wheelBudget > 0 ? -1 : 1;
      wheelBudget = 0;
      bumpDesktopZoom(direction * DESKTOP_ZOOM_STEP);
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('wheel', onWheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  return null;
}

export function DesktopZoomControls({ className = '' }: { className?: string }) {
  const { t } = useTranslation('common');
  const zoom = useDesktopZoom();
  if (!isTauriDesktop()) return null;
  const percent = Math.round(zoom * 100);

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <div>
        <Button
          type="button"
          flat
          onClick={() => bumpDesktopZoom(-DESKTOP_ZOOM_STEP)}
          disabled={zoom <= DESKTOP_ZOOM_MIN}
        >
          {t('desktopZoom.smaller')}
        </Button>
      </div>
      <div>
        <Button type="button" flat onClick={() => setDesktopZoom(1)} disabled={zoom === 1}>
          {t('desktopZoom.reset')}
        </Button>
      </div>
      <div>
        <Button
          type="button"
          flat
          onClick={() => bumpDesktopZoom(DESKTOP_ZOOM_STEP)}
          disabled={zoom >= DESKTOP_ZOOM_MAX}
        >
          {t('desktopZoom.larger')}
        </Button>
      </div>
      <span className="text-sm">{t('desktopZoom.current', { percent })}</span>
    </div>
  );
}

export function DesktopZoomCard() {
  const { t } = useTranslation('common');
  if (!isTauriDesktop()) return null;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-900 p-4 space-y-3">
      <div>
        <h3 className="font-semibold text-base">{t('desktopZoom.title')}</h3>
        <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">
          {t('desktopZoom.help')}
        </p>
      </div>
      <DesktopZoomControls />
    </div>
  );
}
