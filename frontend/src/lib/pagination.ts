/** Reads the cursor from the standard `Link: <...?before=42>; rel="next"` header (RFC 8288). */
export function nextCursorFromLink(link: string | null): number | null {
  const match = /[?&]before=(\d+)[^>]*>\s*;\s*rel="next"/.exec(link ?? '');
  return match ? Number(match[1]) : null;
}
