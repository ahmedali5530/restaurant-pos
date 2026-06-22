import {useNavigate} from "react-router";
import {useTranslation} from "react-i18next";
import {MENU} from "@/routes/posr.ts";
import {Button} from "@/components/common/input/button.tsx";
import {faArrowLeft} from "@fortawesome/free-solid-svg-icons";

const NotFoundIllustration = () => (
  <svg
    viewBox="0 0 400 320"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="w-full max-w-md"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="plate-gradient" x1="80" y1="180" x2="320" y2="280" gradientUnits="userSpaceOnUse">
        <stop stopColor="#525252"/>
        <stop offset="1" stopColor="#262626"/>
      </linearGradient>
      <linearGradient id="receipt-gradient" x1="220" y1="40" x2="340" y2="200" gradientUnits="userSpaceOnUse">
        <stop stopColor="#f5f5f5"/>
        <stop offset="1" stopColor="#d4d4d4"/>
      </linearGradient>
      <linearGradient id="accent-gradient" x1="0" y1="0" x2="1" y2="1">
        <stop stopColor="#f59e0b"/>
        <stop offset="1" stopColor="#d97706"/>
      </linearGradient>
      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
        <feDropShadow dx="0" dy="8" stdDeviation="12" floodColor="#000" floodOpacity="0.35"/>
      </filter>
    </defs>

    {/* floating decorative orbs */}
    <circle cx="60" cy="60" r="28" fill="#f59e0b" fillOpacity="0.12"/>
    <circle cx="350" cy="90" r="18" fill="#3b82f6" fillOpacity="0.15"/>
    <circle cx="320" cy="270" r="22" fill="#f59e0b" fillOpacity="0.1"/>

    {/* table surface */}
    <ellipse cx="200" cy="268" rx="150" ry="18" fill="#171717" fillOpacity="0.6"/>

    {/* plate */}
    <g filter="url(#shadow)">
      <ellipse cx="155" cy="220" rx="72" ry="22" fill="url(#plate-gradient)"/>
      <ellipse cx="155" cy="215" rx="68" ry="20" fill="#404040"/>
      <ellipse cx="155" cy="212" rx="58" ry="16" fill="#525252"/>
    </g>

    {/* fork */}
    <g transform="translate(88, 148) rotate(-18)">
      <rect x="0" y="0" width="5" height="52" rx="2" fill="#a3a3a3"/>
      <rect x="-4" y="0" width="3" height="18" rx="1" fill="#a3a3a3"/>
      <rect x="6" y="0" width="3" height="18" rx="1" fill="#a3a3a3"/>
      <rect x="1" y="0" width="3" height="18" rx="1" fill="#a3a3a3"/>
    </g>

    {/* knife */}
    <g transform="translate(210, 150) rotate(22)">
      <rect x="0" y="0" width="5" height="50" rx="2" fill="#a3a3a3"/>
      <path d="M-2 0 L7 0 L5 20 L0 20 Z" fill="#d4d4d4"/>
    </g>

    {/* floating receipt with 404 */}
    <g filter="url(#shadow)" transform="translate(230, 55) rotate(8)">
      <rect x="0" y="0" width="110" height="150" rx="6" fill="url(#receipt-gradient)"/>
      <rect x="0" y="0" width="110" height="18" rx="6" fill="#e5e5e5"/>
      <path d="M0 18 L110 18" stroke="#d4d4d4" strokeWidth="1"/>
      {/* zigzag bottom */}
      <path
        d="M0 150 L8 142 L16 150 L24 142 L32 150 L40 142 L48 150 L56 142 L64 150 L72 142 L80 150 L88 142 L96 150 L104 142 L110 150 L110 150 L0 150 Z"
        fill="url(#receipt-gradient)"
      />
      <text x="55" y="72" textAnchor="middle" fontSize="36" fontWeight="700" fill="#171717" fontFamily="system-ui, sans-serif">
        404
      </text>
      <line x1="20" y1="88" x2="90" y2="88" stroke="#a3a3a3" strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="100" x2="75" y2="100" stroke="#d4d4d4" strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="112" x2="85" y2="112" stroke="#d4d4d4" strokeWidth="2" strokeLinecap="round"/>
      <line x1="20" y1="124" x2="60" y2="124" stroke="#d4d4d4" strokeWidth="2" strokeLinecap="round"/>
    </g>

    {/* question marks */}
    <text x="175" y="195" fontSize="22" fill="#f59e0b" fontWeight="700" fontFamily="system-ui, sans-serif" opacity="0.9">?</text>
    <text x="125" y="175" fontSize="16" fill="#737373" fontWeight="600" fontFamily="system-ui, sans-serif">?</text>
    <text x="195" y="185" fontSize="14" fill="#525252" fontWeight="600" fontFamily="system-ui, sans-serif">?</text>

    {/* dashed path showing lost route */}
    <path
      d="M300 80 Q260 120 200 140 T120 200"
      stroke="url(#accent-gradient)"
      strokeWidth="2"
      strokeDasharray="6 6"
      fill="none"
      opacity="0.5"
    />
    <circle cx="300" cy="80" r="5" fill="#f59e0b"/>
    <circle cx="120" cy="200" r="4" fill="#737373"/>
  </svg>
);

export const NotFound = () => {
  const {t} = useTranslation('common');
  const navigate = useNavigate();

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 overflow-hidden bg-neutral-900 px-6 py-12">
      <NotFoundIllustration/>

      <div className="z-10 flex max-w-md flex-col items-center gap-3 text-center">
        <h1 className="text-4xl font-bold text-neutral-100">{t('notFound.title')}</h1>
        <p className="text-lg text-neutral-400">{t('notFound.description')}</p>
      </div>

      <Button variant="primary" size="lg" icon={faArrowLeft} onClick={() => navigate(MENU)}>
        {t('notFound.backToMenu')}
      </Button>

      <div className="pointer-events-none absolute right-[20%] top-10 size-[100px] rounded-full bg-warning-500/10 blur-lg transition-all"/>
      <div className="pointer-events-none absolute bottom-[100px] right-24 size-[200px] rotate-45 bg-white/20 blur-2xl transition-all"/>
      <div className="pointer-events-none absolute bottom-[30%] left-[150px] size-[200px] bg-[tomato]/20 blur-2xl transition-all"/>
      <div className="pointer-events-none absolute left-[20%] top-20 size-[200px] animate-bounce rounded-full bg-primary-500/10 blur-2xl transition-all"/>
    </div>
  );
};
