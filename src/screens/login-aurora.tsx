import { useEffect, useRef, useState } from "react";

type AuroraLine = {
  offset: number;
  amp: number;
  wavelength: number;
  speed: number;
  sizeSpeed: number;
  width: number;
  opacity: number;
  color: string;
};

/** One green family, light through dark. The parent hue cycle shifts them together. */
const LINES: AuroraLine[] = [
  { offset: -72, amp: 48, wavelength: 520, speed: 0.19, sizeSpeed: 0.1, width: 28, opacity: 0.28, color: "rgb(6, 95, 70)" },
  { offset: -36, amp: 64, wavelength: 420, speed: 0.24, sizeSpeed: 0.07, width: 16, opacity: 0.45, color: "rgb(5, 150, 105)" },
  { offset: -8, amp: 86, wavelength: 360, speed: 0.17, sizeSpeed: 0.08, width: 8, opacity: 0.9, color: "rgb(167, 243, 208)" },
  { offset: 22, amp: 58, wavelength: 460, speed: 0.28, sizeSpeed: 0.05, width: 12, opacity: 0.62, color: "rgb(52, 211, 153)" },
  { offset: 54, amp: 74, wavelength: 320, speed: 0.21, sizeSpeed: 0.11, width: 18, opacity: 0.38, color: "rgb(16, 185, 129)" },
  { offset: 12, amp: 96, wavelength: 400, speed: 0.14, sizeSpeed: 0.08, width: 6, opacity: 0.8, color: "rgb(209, 250, 229)" },
];

const usePrefersReducedMotion = () => {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
};

const linePath = (
  width: number,
  yBase: number,
  amp: number,
  wavelength: number,
  phase: number,
) => {
  const step = 8;
  let d = "";
  for (let x = 0; x <= width; x += step) {
    const wave = Math.sin((x / wavelength) * Math.PI * 2 + phase) * amp;
    const ripple = Math.sin((x / (wavelength * 0.46)) * Math.PI * 2 + phase * 1.6) * amp * 0.28;
    const y = yBase + wave + ripple;
    d += x === 0 ? `M ${x} ${y.toFixed(1)}` : ` L ${x} ${y.toFixed(1)}`;
  }
  return d;
};

export const LoginAurora = () => {
  const reduced = usePrefersReducedMotion();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const glowRefs = useRef<Array<SVGPathElement | null>>([]);
  const coreRefs = useRef<Array<SVGPathElement | null>>([]);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    let frame = 0;
    const started = performance.now();

    const draw = (now: number) => {
      const t = reduced ? 0 : (now - started) / 1000;
      const width = svg.clientWidth;
      const height = svg.clientHeight;
      if (width > 0 && height > 0) {
        const center = height * 0.16 + Math.sin(t * 0.1) * height * 0.04;
        LINES.forEach((line, index) => {
          const size = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * line.sizeSpeed + index * 1.4));
          const amp = line.amp * size;
          const yBase = center + line.offset * (0.45 + size);
          const phase = t * line.speed + index * 0.8;
          const d = linePath(width, yBase, amp, line.wavelength, phase);
          const glow = glowRefs.current[index];
          const core = coreRefs.current[index];
          glow?.setAttribute("d", d);
          core?.setAttribute("d", d);
          core?.setAttribute("stroke-width", String(line.width * (0.65 + size * 0.7)));
          glow?.setAttribute("stroke-width", String(line.width * (2.2 + size * 1.4)));
        });
      }
      if (!reduced) frame = window.requestAnimationFrame(draw);
    };

    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [reduced]);

  return (
    <div className="login-aurora" aria-hidden="true">
      <svg ref={svgRef} className="login-aurora__lines blur-xl">
        <g className="login-aurora__glow">
          {LINES.map((line, index) => (
            <path
              key={`glow-${index}`}
              ref={(node) => { glowRefs.current[index] = node; }}
              fill="none"
              stroke={line.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={line.opacity * 0.7}
            />
          ))}
        </g>
        <g>
          {LINES.map((line, index) => (
            <path
              key={`core-${index}`}
              ref={(node) => { coreRefs.current[index] = node; }}
              fill="none"
              stroke={line.color}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={line.opacity}
            />
          ))}
        </g>
      </svg>
    </div>
  );
};
