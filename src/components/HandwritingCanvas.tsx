import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type Stroke = {
  tool: "pen" | "eraser";
  color: string;
  size: number;
  points: Array<{ x: number; y: number; p: number; t?: number }>;
};

export type InkStats = {
  strokeCount: number;
  eraserCount: number;
  /** Longest gap (ms) between consecutive strokes. */
  idleMaxMs: number;
  /** Time (ms) since the last stroke ended. */
  sinceLastMs: number;
  /** Total elapsed time (ms) from first to last stroke. */
  spanMs: number;
};

export type CanvasHandle = {
  clear: () => void;
  undo: () => void;
  redo: () => void;
  exportJpeg: (quality?: number, maxWidth?: number) => string | null;
  isDirty: () => boolean;
  markClean: () => void;
  getStrokes: () => Stroke[];
  setStrokes: (strokes: Stroke[]) => void;
  getInkStats: () => InkStats;
};

type Props = {
  tool: "pen" | "eraser";
  color: string;
  size: number;
  readOnly?: boolean;
};

export const HandwritingCanvas = forwardRef<CanvasHandle, Props>(function HandwritingCanvas(
  { tool, color, size, readOnly = false },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const strokesRef = useRef<Stroke[]>([]);
  const redoRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const dirtyRef = useRef(false);
  const [, force] = useState(0);

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    const all = [...strokesRef.current, ...(drawingRef.current ? [drawingRef.current] : [])];
    for (const s of all) {
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const isEraser = s.tool === "eraser";
      ctx.strokeStyle = isEraser ? "#ffffff" : s.color;
      const baseW = s.size * (isEraser ? 4 : 1);
      const pts = s.points;

      // Single tap → filled dot (pressure-scaled for the pen).
      if (pts.length < 2) {
        const p = pts[0];
        if (p) {
          const r = (baseW * (isEraser ? 1 : 0.55 + 0.9 * (p.p ?? 0.5))) / 2;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, r), 0, Math.PI * 2);
          ctx.fillStyle = ctx.strokeStyle;
          ctx.fill();
        }
        continue;
      }

      if (isEraser) {
        // Constant width, quadratic-smoothed path.
        ctx.lineWidth = baseW;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length - 1; i++) {
          const p0 = pts[i];
          const p1 = pts[i + 1];
          ctx.quadraticCurveTo(p0.x, p0.y, (p0.x + p1.x) / 2, (p0.y + p1.y) / 2);
        }
        const last = pts[pts.length - 1];
        ctx.lineTo(last.x, last.y);
        ctx.stroke();
        continue;
      }

      // Pen: pressure-variable width, drawn as short smoothed segments so the
      // line thickens/thins naturally with stylus pressure.
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1];
        const b = pts[i];
        const pa = a.p ?? 0.5;
        const pb = b.p ?? 0.5;
        ctx.lineWidth = baseW * (0.55 + 0.9 * ((pa + pb) / 2));
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  };

  useEffect(() => {
    const c = canvasRef.current;
    const container = containerRef.current;
    if (!c || !container) return;
    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      c.width = Math.floor(rect.width * dpr);
      c.height = Math.floor(rect.height * dpr);
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
      const ctx = c.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      redraw();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    clear: () => {
      strokesRef.current = [];
      redoRef.current = [];
      dirtyRef.current = true;
      redraw();
      force((n) => n + 1);
    },
    undo: () => {
      const s = strokesRef.current.pop();
      if (s) {
        redoRef.current.push(s);
        dirtyRef.current = true;
        redraw();
        force((n) => n + 1);
      }
    },
    redo: () => {
      const s = redoRef.current.pop();
      if (s) {
        strokesRef.current.push(s);
        dirtyRef.current = true;
        redraw();
        force((n) => n + 1);
      }
    },
    exportJpeg: (quality = 0.9, maxWidth = 1600) => {
      const c = canvasRef.current;
      if (!c) return null;
      // Compute a tight bounding box around ink strokes (in canvas px).
      const dpr = window.devicePixelRatio || 1;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let hasInk = false;
      for (const s of strokesRef.current) {
        if (s.tool === "eraser") continue;
        const pad = s.size;
        for (const p of s.points) {
          hasInk = true;
          if (p.x - pad < minX) minX = p.x - pad;
          if (p.y - pad < minY) minY = p.y - pad;
          if (p.x + pad > maxX) maxX = p.x + pad;
          if (p.y + pad > maxY) maxY = p.y + pad;
        }
      }
      const cssW = c.width / dpr;
      const cssH = c.height / dpr;
      let sx = 0, sy = 0, sw = c.width, sh = c.height;
      if (hasInk) {
        const marginCss = 24;
        const x0 = Math.max(0, Math.floor(minX - marginCss));
        const y0 = Math.max(0, Math.floor(minY - marginCss));
        const x1 = Math.min(cssW, Math.ceil(maxX + marginCss));
        const y1 = Math.min(cssH, Math.ceil(maxY + marginCss));
        sx = Math.floor(x0 * dpr);
        sy = Math.floor(y0 * dpr);
        sw = Math.max(1, Math.floor((x1 - x0) * dpr));
        sh = Math.max(1, Math.floor((y1 - y0) * dpr));
      }
      const scale = Math.min(1, maxWidth / sw);
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.floor(sw * scale));
      out.height = Math.max(1, Math.floor(sh * scale));
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(c, sx, sy, sw, sh, 0, 0, out.width, out.height);
      const dataUrl = out.toDataURL("image/jpeg", quality);
      return dataUrl.split(",")[1] ?? null;
    },
    isDirty: () => dirtyRef.current,
    markClean: () => {
      dirtyRef.current = false;
    },
    getInkStats: () => {
      const strokes = strokesRef.current;
      let firstT = Infinity;
      let lastT = -Infinity;
      let eraserCount = 0;
      let idleMax = 0;
      let prevEnd: number | null = null;
      for (const s of strokes) {
        if (s.tool === "eraser") eraserCount++;
        const pts = s.points;
        if (!pts.length) continue;
        const st = pts[0].t ?? 0;
        const en = pts[pts.length - 1].t ?? st;
        if (st < firstT) firstT = st;
        if (en > lastT) lastT = en;
        if (prevEnd != null && st - prevEnd > idleMax) idleMax = st - prevEnd;
        prevEnd = en;
      }
      const now = Date.now();
      return {
        strokeCount: strokes.length,
        eraserCount,
        idleMaxMs: Number.isFinite(idleMax) ? Math.max(0, idleMax) : 0,
        sinceLastMs: lastT > 0 ? now - lastT : 0,
        spanMs: Number.isFinite(firstT) && lastT > 0 ? lastT - firstT : 0,
      };
    },
    getStrokes: () => strokesRef.current.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) })),
    setStrokes: (strokes: Stroke[]) => {
      strokesRef.current = strokes.map((s) => ({ ...s, points: s.points.map((p) => ({ ...p })) }));
      redoRef.current = [];
      dirtyRef.current = false;
      redraw();
      force((n) => n + 1);
    },
  }));

  // Once a real pen is used, reject touch input so a resting palm doesn't draw.
  const penSeenRef = useRef(false);
  const rejectPalm = (e: React.PointerEvent) => {
    if (e.pointerType === "pen") penSeenRef.current = true;
    return penSeenRef.current && e.pointerType === "touch";
  };

  const getPos = (e: { clientX: number; clientY: number; pressure?: number }) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      // Many pens report 0 pressure on hover/first contact; fall back to 0.5.
      p: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
      t: Date.now(),
    };
  };

  const onDown = (e: React.PointerEvent) => {
    if (readOnly || rejectPalm(e)) return;
    (e.target as Element).setPointerCapture(e.pointerId);
    drawingRef.current = {
      tool,
      color,
      size,
      points: [getPos(e.nativeEvent)],
    };
    redraw();
  };
  const onMove = (e: React.PointerEvent) => {
    if (readOnly || !drawingRef.current || rejectPalm(e)) return;
    const ne = e.nativeEvent as PointerEvent;
    // Capture every sample the device emitted since the last frame — high-refresh
    // styluses fire far faster than pointermove, so this makes strokes far smoother.
    const coalesced =
      typeof ne.getCoalescedEvents === "function" ? ne.getCoalescedEvents() : [];
    if (coalesced.length) {
      for (const ce of coalesced) drawingRef.current.points.push(getPos(ce));
    } else {
      drawingRef.current.points.push(getPos(ne));
    }
    redraw();
  };
  const onUp = () => {
    if (readOnly) return;
    if (drawingRef.current) {
      strokesRef.current.push(drawingRef.current);
      drawingRef.current = null;
      redoRef.current = [];
      dirtyRef.current = true;
      redraw();
      force((n) => n + 1);
    }
  };

  return (
    <div
      ref={containerRef}
      className="relative h-full w-full overflow-hidden rounded-lg border bg-white"
      style={{ touchAction: "none" }}
    >
      <canvas
        ref={canvasRef}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
        onPointerLeave={onUp}
        className={`block h-full w-full ${readOnly ? "cursor-default" : "cursor-crosshair"}`}
      />
    </div>
  );
});