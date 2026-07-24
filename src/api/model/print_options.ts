export const PRINT_OPTIONS_KEY = 'print_options';

export type PrintCopyType = 'temp' | 'final' | 'refund' | 'kitchen' | 'delivery' | 'summary';

export interface PrintCopies {
  temp: number;
  final: number;
  refund: number;
  kitchen: number;
  delivery: number;
  summary: number;
}

export interface PrintMaxAttempts {
  temp: number;
  final: number;
}

export interface PrintOptions {
  copies: PrintCopies;
  max_attempts: PrintMaxAttempts;
}

export const DEFAULT_PRINT_OPTIONS: PrintOptions = {
  copies: {
    temp: 1,
    final: 1,
    refund: 1,
    kitchen: 1,
    delivery: 1,
    summary: 1,
  },
  max_attempts: {
    temp: 0,
    final: 0,
  },
};

/** Map dispatchPrint template name to a copies key. */
export function copiesKeyForTemplate(template: string): PrintCopyType | null {
  switch (template) {
    case 'temp':
      return 'temp';
    case 'final':
      return 'final';
    case 'refund':
      return 'refund';
    case 'kitchen':
    case 'deletion':
      return 'kitchen';
    case 'delivery':
      return 'delivery';
    case 'summary':
      return 'summary';
    default:
      return null;
  }
}
