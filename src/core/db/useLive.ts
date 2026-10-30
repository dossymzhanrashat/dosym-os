import { useEffect, useState, type DependencyList } from 'react';
import { liveQuery } from 'dexie';

/** Re-renders whenever the Dexie data read by `query` changes (on this device or from sync). */
export function useLive<T>(query: () => Promise<T>, deps: DependencyList, initial: T): T {
  const [value, setValue] = useState<T>(initial);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: setValue, error: (e) => console.error('[db]', e) });
    return () => sub.unsubscribe();
  }, deps);
  return value;
}
