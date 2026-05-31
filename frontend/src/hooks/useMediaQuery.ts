import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(query);
    const next = () => setMatches(mq.matches);
    next();
    mq.addEventListener('change', next);
    return () => mq.removeEventListener('change', next);
  }, [query]);

  return matches;
}
