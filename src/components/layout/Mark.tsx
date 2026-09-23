/** Značka Aurum: žlutá kulatá klávesa „=“ – výsledek, bilance. */
export function Mark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <circle cx="16" cy="16" r="15.5" fill="#1e1d1b" opacity="0.14" />
      <circle cx="16" cy="15.5" r="14.5" fill="#f2b632" />
      <rect x="9.5" y="11.25" width="13" height="2.6" rx="1.3" fill="#1e1d1b" />
      <rect x="9.5" y="17.15" width="13" height="2.6" rx="1.3" fill="#1e1d1b" />
    </svg>
  );
}
