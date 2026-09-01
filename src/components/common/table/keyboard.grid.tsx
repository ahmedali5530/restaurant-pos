import {
  createElement,
  ElementType,
  HTMLAttributes,
  KeyboardEvent,
  ReactNode,
  useCallback,
  useRef,
} from "react";
import {cn} from "@/lib/utils.ts";

const CELL_SELECTOR = "[data-keyboard-grid-cell='true']";
const FOCUSABLE_SELECTOR =
  'input:not([disabled]):not([type="hidden"]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Direction = "up" | "down" | "left" | "right";

const arrowToDirection = (key: string): Direction | null => {
  switch (key) {
    case "ArrowUp":
      return "up";
    case "ArrowDown":
      return "down";
    case "ArrowLeft":
      return "left";
    case "ArrowRight":
      return "right";
    default:
      return null;
  }
};

const parseCellCoords = (el: Element): {row: number; col: number} | null => {
  const row = Number(el.getAttribute("data-row"));
  const col = Number(el.getAttribute("data-col"));
  if (!Number.isFinite(row) || !Number.isFinite(col)) return null;
  return {row, col};
};

const isDisabledCell = (el: Element) =>
  el.getAttribute("data-disabled") === "true" ||
  el.getAttribute("aria-disabled") === "true";

const getFocusable = (cell: Element): HTMLElement | null => {
  if (cell.matches(FOCUSABLE_SELECTOR)) return cell as HTMLElement;
  return cell.querySelector(FOCUSABLE_SELECTOR);
};

/** Focus (and select when possible) the control inside a navigable cell. */
export const focusKeyboardGridCell = (
  root: ParentNode | null | undefined,
  row: number,
  col: number
): boolean => {
  if (!root) return false;
  const cell = root.querySelector(
    `${CELL_SELECTOR}[data-row="${row}"][data-col="${col}"]`
  );
  if (!cell || isDisabledCell(cell)) return false;
  const target = getFocusable(cell);
  if (!target) return false;
  target.focus();
  if (typeof (target as HTMLInputElement).select === "function") {
    try {
      (target as HTMLInputElement).select();
    } catch {
      // ignore non-selectable inputs
    }
  }
  return true;
};

const findNextCell = (
  root: HTMLElement,
  fromRow: number,
  fromCol: number,
  direction: Direction
): {row: number; col: number} | null => {
  const cells = Array.from(root.querySelectorAll(CELL_SELECTOR)).filter(
    (el) => !isDisabledCell(el)
  );
  if (cells.length === 0) return null;

  const coords = cells
    .map((el) => parseCellCoords(el))
    .filter((c): c is {row: number; col: number} => c != null);

  if (coords.length === 0) return null;

  const rows = [...new Set(coords.map((c) => c.row))].sort((a, b) => a - b);
  const cols = [...new Set(coords.map((c) => c.col))].sort((a, b) => a - b);

  const has = (row: number, col: number) =>
    coords.some((c) => c.row === row && c.col === col);

  if (direction === "left" || direction === "right") {
    const step = direction === "right" ? 1 : -1;
    const colIndex = cols.indexOf(fromCol);
    if (colIndex < 0) return null;
    for (let i = colIndex + step; i >= 0 && i < cols.length; i += step) {
      const col = cols[i];
      if (has(fromRow, col)) return {row: fromRow, col};
    }
    return null;
  }

  const step = direction === "down" ? 1 : -1;
  const rowIndex = rows.indexOf(fromRow);
  if (rowIndex < 0) return null;
  for (let i = rowIndex + step; i >= 0 && i < rows.length; i += step) {
    const row = rows[i];
    if (has(row, fromCol)) return {row, col: fromCol};
  }
  return null;
};

type KeyboardGridProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export const KeyboardGrid = ({
  children,
  className,
  onKeyDown,
  ...rest
}: KeyboardGridProps) => {
  const rootRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      onKeyDown?.(event);
      if (event.defaultPrevented) return;

      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier) return;

      const direction = arrowToDirection(event.key);
      if (!direction) return;

      const root = rootRef.current;
      if (!root) return;

      const active = document.activeElement;
      if (!active || !root.contains(active)) return;

      const cell = active.closest(CELL_SELECTOR);
      if (!cell || !root.contains(cell)) return;

      const coords = parseCellCoords(cell);
      if (!coords) return;

      const next = findNextCell(root, coords.row, coords.col, direction);
      if (!next) return;

      event.preventDefault();
      event.stopPropagation();
      focusKeyboardGridCell(root, next.row, next.col);
    },
    [onKeyDown]
  );

  return (
    <div
      ref={rootRef}
      role="grid"
      className={cn(className)}
      onKeyDownCapture={handleKeyDown}
      {...rest}
    >
      {children}
    </div>
  );
};

type KeyboardGridCellProps = HTMLAttributes<HTMLElement> & {
  row: number;
  col: number;
  /** When false, cell is not part of Ctrl+Arrow navigation. Default true. */
  navigable?: boolean;
  disabled?: boolean;
  /** Element type to render. Defaults to td. */
  as?: ElementType;
  children?: ReactNode;
};

export const KeyboardGridCell = ({
  row,
  col,
  navigable = true,
  disabled = false,
  as = "td",
  children,
  className,
  ...rest
}: KeyboardGridCellProps) => {
  const props: Record<string, unknown> = {
    className: cn(className),
    ...rest,
  };

  if (navigable) {
    props.role = "gridcell";
    props["data-keyboard-grid-cell"] = "true";
    props["data-row"] = String(row);
    props["data-col"] = String(col);
    if (disabled) {
      props["data-disabled"] = "true";
      props["aria-disabled"] = "true";
    }
  }

  return createElement(as, props, children);
};
