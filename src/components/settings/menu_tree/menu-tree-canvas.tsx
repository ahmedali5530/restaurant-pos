import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  WheelEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  MenuTreeNode,
  MenuTreeSelectPayload,
} from "@/components/settings/menu_tree/build-menu-tree.ts";
import {
  layoutMenuTree,
  MENU_TREE_NODE_HEIGHT,
  MENU_TREE_NODE_WIDTH,
  LaidOutNode,
} from "@/components/settings/menu_tree/layout-menu-tree.ts";

interface Props {
  roots: MenuTreeNode[];
  expanded: Set<string>;
  onSelect?: (payload: MenuTreeSelectPayload) => void;
  kindLabel: (kind: MenuTreeNode["kind"]) => string;
  fitToken?: number;
  zoomInToken?: number;
  zoomOutToken?: number;
}

type Transform = { scale: number; tx: number; ty: number };

function truncate(text: string, max = 18): string {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

function cssRgb(varName: string, alpha?: number): string {
  const raw = getComputedStyle(document.documentElement)
    .getPropertyValue(varName)
    .trim();
  if (!raw) return alpha != null ? `rgba(128,128,128,${alpha})` : "rgb(128,128,128)";
  if (alpha == null) return `rgb(${raw})`;
  return `rgb(${raw} / ${alpha})`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function kindColors(kind: MenuTreeNode["kind"]): { fill: string; stroke: string } {
  switch (kind) {
    case "category":
    case "uncategorized":
      return { fill: cssRgb("--primary", 0.18), stroke: cssRgb("--primary") };
    case "dish":
      return { fill: cssRgb("--info", 0.16), stroke: cssRgb("--info") };
    case "modifier_group":
      return { fill: cssRgb("--warning", 0.18), stroke: cssRgb("--warning") };
    case "modifier":
      return { fill: cssRgb("--success", 0.16), stroke: cssRgb("--success") };
    default:
      return {
        fill: cssRgb("--surface-elevated"),
        stroke: cssRgb("--border"),
      };
  }
}

function hitTest(
  nodes: LaidOutNode[],
  worldX: number,
  worldY: number
): LaidOutNode | null {
  const hw = MENU_TREE_NODE_WIDTH / 2;
  // Top-most first (later in paint order)
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const left = n.x - hw;
    const top = n.y;
    if (
      worldX >= left &&
      worldX <= left + MENU_TREE_NODE_WIDTH &&
      worldY >= top &&
      worldY <= top + MENU_TREE_NODE_HEIGHT
    ) {
      return n;
    }
  }
  return null;
}

export const MenuTreeCanvas = ({
  roots,
  expanded,
  onSelect,
  kindLabel,
  fitToken = 0,
  zoomInToken = 0,
  zoomOutToken = 0,
}: Props) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const transformRef = useRef<Transform>({ scale: 1, tx: 0, ty: 0 });
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originTx: number;
    originTy: number;
    moved: boolean;
  } | null>(null);
  const rafRef = useRef<number>(0);
  const onSelectRef = useRef(onSelect);
  const kindLabelRef = useRef(kindLabel);
  onSelectRef.current = onSelect;
  kindLabelRef.current = kindLabel;

  const layout = useMemo(
    () => layoutMenuTree(roots, expanded),
    [roots, expanded]
  );
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const viewport = viewportRef.current;
    if (!canvas || !viewport) return;

    const dpr = window.devicePixelRatio || 1;
    const cssW = viewport.clientWidth;
    const cssH = viewport.clientHeight;
    if (cssW < 2 || cssH < 2) return;

    const pixelW = Math.floor(cssW * dpr);
    const pixelH = Math.floor(cssH * dpr);
    if (canvas.width !== pixelW || canvas.height !== pixelH) {
      canvas.width = pixelW;
      canvas.height = pixelH;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { scale, tx, ty } = transformRef.current;
    const current = layoutRef.current;
    const hw = MENU_TREE_NODE_WIDTH / 2;
    const hh = MENU_TREE_NODE_HEIGHT;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    ctx.fillStyle = cssRgb("--surface");
    ctx.fillRect(0, 0, cssW, cssH);

    // World-space viewport with padding for culling
    const pad = 40 / Math.max(scale, 0.01);
    const viewLeft = (-tx) / scale - pad;
    const viewTop = (-ty) / scale - pad;
    const viewRight = (cssW - tx) / scale + pad;
    const viewBottom = (cssH - ty) / scale + pad;

    ctx.save();
    ctx.translate(tx, ty);
    ctx.scale(scale, scale);

    const border = cssRgb("--border");
    const muted = cssRgb("--muted");
    const foreground = cssRgb("--foreground");

    // Links (cull by segment bbox)
    ctx.strokeStyle = border;
    ctx.lineWidth = 1.5 / scale;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (const link of current.links) {
      const x1 = link.from.x;
      const y1 = link.from.y + hh;
      const x2 = link.to.x;
      const y2 = link.to.y;
      const midY = (y1 + y2) / 2;
      const minX = Math.min(x1, x2);
      const maxX = Math.max(x1, x2);
      if (maxX < viewLeft || minX > viewRight || y2 < viewTop || y1 > viewBottom) {
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x1, midY);
      ctx.lineTo(x2, midY);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    }

    // Skip tiny text when zoomed far out
    const showText = scale >= 0.18;
    const showSubtitle = scale >= 0.28;

    for (const laid of current.nodes) {
      const left = laid.x - hw;
      const top = laid.y;
      if (
        left + MENU_TREE_NODE_WIDTH < viewLeft ||
        left > viewRight ||
        top + hh < viewTop ||
        top > viewBottom
      ) {
        continue;
      }

      const { fill, stroke } = kindColors(laid.node.kind);
      roundRect(ctx, left, top, MENU_TREE_NODE_WIDTH, hh, 8);
      ctx.fillStyle = fill;
      ctx.fill();
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1.5 / scale;
      ctx.stroke();

      if (!showText) continue;

      const { node } = laid;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";

      ctx.fillStyle = muted;
      ctx.font = "9px system-ui, sans-serif";
      ctx.fillText(kindLabelRef.current(node.kind), laid.x, top + 18);

      ctx.fillStyle = foreground;
      ctx.font = "600 12px system-ui, sans-serif";
      ctx.fillText(truncate(node.name), laid.x, top + 34);

      if (!showSubtitle) continue;
      const bits: string[] = [];
      if (node.price != null && Number.isFinite(node.price)) {
        bits.push(String(node.price));
      }
      if (node.required) bits.push("●");
      if (node.hidden || node.hiddenFromMenu) bits.push("⊘");
      if (bits.length) {
        ctx.fillStyle = muted;
        ctx.font = "9px system-ui, sans-serif";
        ctx.fillText(bits.join(" · "), laid.x, top + 46);
      }
    }

    ctx.restore();
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      draw();
    });
  }, [draw]);

  const fitToView = useCallback(() => {
    const el = viewportRef.current;
    const current = layoutRef.current;
    if (!el || current.width <= 0 || current.height <= 0) return;
    const { clientWidth, clientHeight } = el;
    if (clientWidth < 40 || clientHeight < 40) return;
    const pad = 32;
    const sx = (clientWidth - pad * 2) / current.width;
    const sy = (clientHeight - pad * 2) / current.height;
    const next = Math.max(0.05, Math.min(sx, sy, 1.5));
    transformRef.current = {
      scale: next,
      tx: (clientWidth - current.width * next) / 2,
      ty: (clientHeight - current.height * next) / 2,
    };
    scheduleDraw();
  }, [scheduleDraw]);

  useEffect(() => {
    scheduleDraw();
  }, [layout, scheduleDraw]);

  useEffect(() => {
    if (!fitToken) return;
    const id = requestAnimationFrame(() => fitToView());
    return () => cancelAnimationFrame(id);
  }, [fitToken, fitToView]);

  useEffect(() => {
    if (!zoomInToken) return;
    const el = viewportRef.current;
    const t = transformRef.current;
    const mx = el ? el.clientWidth / 2 : 0;
    const my = el ? el.clientHeight / 2 : 0;
    const next = Math.min(4, t.scale * 1.25);
    const wx = (mx - t.tx) / t.scale;
    const wy = (my - t.ty) / t.scale;
    transformRef.current = {
      scale: next,
      tx: mx - wx * next,
      ty: my - wy * next,
    };
    scheduleDraw();
  }, [zoomInToken, scheduleDraw]);

  useEffect(() => {
    if (!zoomOutToken) return;
    const el = viewportRef.current;
    const t = transformRef.current;
    const mx = el ? el.clientWidth / 2 : 0;
    const my = el ? el.clientHeight / 2 : 0;
    const next = Math.max(0.05, t.scale / 1.25);
    const wx = (mx - t.tx) / t.scale;
    const wy = (my - t.ty) / t.scale;
    transformRef.current = {
      scale: next,
      tx: mx - wx * next,
      ty: my - wy * next,
    };
    scheduleDraw();
  }, [zoomOutToken, scheduleDraw]);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => scheduleDraw());
    ro.observe(el);
    return () => ro.disconnect();
  }, [scheduleDraw]);

  useEffect(() => {
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = transformRef.current;
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    const next = Math.min(4, Math.max(0.05, t.scale * factor));
    const wx = (mx - t.tx) / t.scale;
    const wy = (my - t.ty) / t.scale;
    transformRef.current = {
      scale: next,
      tx: mx - wx * next,
      ty: my - wy * next,
    };
    scheduleDraw();
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const t = transformRef.current;
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originTx: t.tx,
      originTy: t.ty,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) drag.moved = true;
    transformRef.current = {
      ...transformRef.current,
      tx: drag.originTx + dx,
      ty: drag.originTy + dy,
    };
    scheduleDraw();
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const wasDrag = drag.moved;
    dragRef.current = null;

    if (wasDrag) return;

    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const t = transformRef.current;
    const worldX = (mx - t.tx) / t.scale;
    const worldY = (my - t.ty) / t.scale;
    const hit = hitTest(layoutRef.current.nodes, worldX, worldY);
    if (!hit) return;
    const { node } = hit;
    if (!node.selectable || !node.id) return;
    if (
      node.kind === "category" ||
      node.kind === "dish" ||
      node.kind === "modifier_group" ||
      node.kind === "modifier"
    ) {
      onSelectRef.current?.({
        kind: node.kind,
        id: node.id,
        name: node.name,
      });
    }
  };

  return (
    <div
      ref={viewportRef}
      className="relative w-full h-full min-h-[60vh] overflow-hidden rounded-lg border border-border bg-surface cursor-grab active:cursor-grabbing"
      data-testid="menu-tree-canvas-viewport"
      onWheel={onWheel}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <canvas
        ref={canvasRef}
        className="block w-full h-full touch-none select-none"
        data-testid="menu-tree-canvas"
      />
    </div>
  );
};
