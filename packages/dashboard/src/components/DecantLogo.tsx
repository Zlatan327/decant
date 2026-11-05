export function DecantLogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="decant-logo-grad" x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#00EC97" />
          <stop offset="100%" stopColor="#00C9A7" />
        </linearGradient>
      </defs>
      {/* Stylized DECANT D with routing flow */}
      <path d="M20 16 L20 48" stroke="url(#decant-logo-grad)" strokeWidth="5" strokeLinecap="round" />
      <path
        d="M20 16 L34 16 Q48 16 48 32 Q48 48 34 48 L20 48"
        stroke="url(#decant-logo-grad)"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Routing funnel arrow motif */}
      <path
        d="M28 24 L38 32 L28 40"
        stroke="url(#decant-logo-grad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity="0.85"
      />
    </svg>
  );
}
