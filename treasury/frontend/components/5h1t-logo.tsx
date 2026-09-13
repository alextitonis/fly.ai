/** 5H1T logo — SVG neural network motif. ~15 lines custom. */
export function FiveHitLogo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="20" cy="30" r="4" fill="#6cf08a" />
      <circle cx="50" cy="20" r="5" fill="#3ed8ff" />
      <circle cx="80" cy="35" r="4" fill="#ff5ad2" />
      <circle cx="35" cy="60" r="4" fill="#6cf08a" />
      <circle cx="65" cy="65" r="5" fill="#3ed8ff" />
      <circle cx="50" cy="85" r="4" fill="#ff5ad2" />
      <line x1="20" y1="30" x2="50" y2="20" stroke="#6cf08a" strokeWidth="1" opacity="0.5" />
      <line x1="50" y1="20" x2="80" y2="35" stroke="#3ed8ff" strokeWidth="1" opacity="0.5" />
      <line x1="20" y1="30" x2="35" y2="60" stroke="#6cf08a" strokeWidth="1" opacity="0.5" />
      <line x1="80" y1="35" x2="65" y2="65" stroke="#ff5ad2" strokeWidth="1" opacity="0.5" />
      <line x1="35" y1="60" x2="50" y2="85" stroke="#6cf08a" strokeWidth="1" opacity="0.5" />
      <line x1="65" y1="65" x2="50" y2="85" stroke="#3ed8ff" strokeWidth="1" opacity="0.5" />
      <line x1="35" y1="60" x2="65" y2="65" stroke="#ff5ad2" strokeWidth="1" opacity="0.5" />
      <text x="50" y="55" textAnchor="middle" fill="#e7ecf1" fontSize="14" fontWeight="bold" fontFamily="monospace">5H1T</text>
    </svg>
  );
}
