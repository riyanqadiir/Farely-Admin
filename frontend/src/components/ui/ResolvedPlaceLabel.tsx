import { useQuery } from '@tanstack/react-query';
import { reverseGeocode } from '../../lib/geocode';
import { formatCoordPair, hasValidCoords } from '../../lib/mapsLinks';
import { cn } from '../../lib/utils';

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function looselyEquivalent(stored: string, resolved: string): boolean {
  const a = normalize(stored).replace(/[^a-z0-9\u0600-\u06FF]/g, '');
  const b = normalize(resolved).replace(/[^a-z0-9\u0600-\u06FF]/g, '');
  if (!a || !b) return false;
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length <= b.length ? b : a;
  return shorter.length >= 8 && longer.includes(shorter.slice(0, Math.min(12, shorter.length)));
}

/**
 * When coordinates exist, resolves a human-readable place via reverse geocoding (cached).
 * Shows ambiguous stored strings (e.g. Plus Codes) only as a secondary "App saved" line.
 */
export function ResolvedPlaceLabel({
  storedLabel,
  coords,
  className,
}: {
  storedLabel: string;
  coords?: { latitude: number; longitude: number } | null;
  className?: string;
}) {
  const coordsOk = coords != null && hasValidCoords(coords);

  const { data: resolved, isLoading } = useQuery({
    queryKey: ['reverse-geocode', coords?.latitude, coords?.longitude],
    queryFn: () => reverseGeocode(coords!.latitude, coords!.longitude),
    enabled: coordsOk,
    staleTime: 30 * 24 * 60 * 60 * 1000,
    gcTime: 35 * 24 * 60 * 60 * 1000,
  });

  if (!coordsOk) {
    const t = storedLabel?.trim();
    return (
      <p className={cn('text-sm text-slate-900 leading-snug break-words font-semibold', className)}>
        {t || '—'}
      </p>
    );
  }

  const stored = storedLabel?.trim() ?? '';
  const coordFallback = formatCoordPair(coords);
  const resolvedText = resolved?.trim() ?? '';
  const primary = resolvedText || (stored.length > 0 ? stored : coordFallback);

  const showSecondary = stored.length > 0 && resolvedText.length > 0 && !looselyEquivalent(stored, resolvedText);

  return (
    <div className={cn('space-y-1', className)}>
      {isLoading && !resolvedText ? (
        <p className="text-sm text-slate-400 italic">Resolving nearby place…</p>
      ) : (
        <p className="text-sm font-semibold text-slate-900 leading-snug break-words">{primary}</p>
      )}
      {showSecondary && (
        <p className="text-[11px] text-slate-500 leading-snug break-words">
          <span className="font-bold text-slate-400 uppercase tracking-wide">App saved · </span>
          {stored}
        </p>
      )}
    </div>
  );
}
