/**
 * The Zarvis name with the Zcash community's Z: the letter with the two
 * strokes of the Zcash sign (written "ᙇ", U+1647, in text). It is drawn as a
 * vector because system fonts render that character small and unevenly; the
 * glyph follows the surrounding font size and colour. Readers get "Zarvis".
 */
export function ZarvisWordmark({ className }: { className?: string }) {
  return (
    <span className={`zarvis-wordmark${className ? ` ${className}` : ""}`} role="img" aria-label="Zarvis">
      <svg className="zarvis-wordmark-z" viewBox="0 0 62 100" aria-hidden="true" focusable="false">
        <path d="M4 14H58V26L21 74H58V86H4V74L41 26H4Z" />
        <rect x="25.5" y="1" width="11" height="15" />
        <rect x="25.5" y="84" width="11" height="15" />
      </svg>
      <span aria-hidden="true">arvis</span>
    </span>
  );
}
