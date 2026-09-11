import { useMemo } from 'react';
import type { PartialTheme } from '@nivo/theming';
import { useTheme } from '@/providers/theme.provider.tsx';
import { paletteRgb } from '@/lib/theme.ts';

/**
 * Nivo theme from the JS brand palette (no getComputedStyle lag).
 */
export function useNivoTheme(): PartialTheme {
  const { isDark, palette } = useTheme();

  return useMemo(() => {
    const foreground = paletteRgb(palette.foreground);
    const muted = paletteRgb(palette.muted);
    const border = paletteRgb(palette.border);
    const surface = paletteRgb(palette.surfaceElevated);
    const primary = paletteRgb(palette.primary);

    return {
      background: 'transparent',
      text: {
        fill: foreground,
        fontSize: 12,
      },
      axis: {
        domain: {
          line: {
            stroke: border,
            strokeWidth: 1,
          },
        },
        ticks: {
          line: {
            stroke: border,
            strokeWidth: 1,
          },
          text: {
            fill: muted,
          },
        },
        legend: {
          text: {
            fill: foreground,
          },
        },
      },
      grid: {
        line: {
          stroke: border,
          strokeWidth: 1,
        },
      },
      legends: {
        text: {
          fill: muted,
        },
      },
      tooltip: {
        container: {
          background: surface,
          color: foreground,
          borderRadius: 8,
          boxShadow: isDark
            ? '0 4px 12px rgba(0,0,0,0.45)'
            : '0 4px 12px rgba(0,0,0,0.12)',
        },
      },
      labels: {
        text: {
          fill: foreground,
        },
      },
      crosshair: {
        line: {
          stroke: primary,
          strokeWidth: 1,
          strokeOpacity: 0.5,
        },
      },
    } satisfies PartialTheme;
  }, [isDark, palette]);
}

/** Default categorical palette biased toward brand primary + neutrals. */
export function useNivoColors(): string[] {
  const { palette, isDark } = useTheme();
  return useMemo(() => {
    const colors = [
      paletteRgb(palette.primary),
      paletteRgb(palette.info),
      paletteRgb(palette.success),
      paletteRgb(palette.warning),
      paletteRgb(palette.danger),
    ];
    if (isDark) {
      return [...colors, '#a3a3a3', '#737373'];
    }
    return [...colors, '#737373', '#a3a3a3'];
  }, [palette, isDark]);
}
