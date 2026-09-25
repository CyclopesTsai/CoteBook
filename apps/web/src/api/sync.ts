import type { SyncEvent } from '@cotebook/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { clientId } from './client';
import { queryKeys } from './queries';

type Listener = (event: SyncEvent) => void;
const listeners = new Set<Listener>();

/** Subscribe to sync events caused by *other* tabs and devices. */
export function onRemoteChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Keeps this tab consistent with the user's other devices: listens on the server's
 * event stream and refreshes the affected data. After a reconnect everything is
 * refetched, since events may have been missed while offline.
 */
export function useSyncEvents(enabled: boolean) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    const source = new EventSource('/api/events');
    let connectedBefore = false;

    source.onopen = () => {
      if (connectedBefore) {
        void qc.invalidateQueries({ queryKey: queryKeys.pages });
        listeners.forEach((l) => l({ type: 'pages.changed', pageIds: [], originClientId: null }));
      }
      connectedBefore = true;
    };

    const handle = (e: MessageEvent<string>) => {
      let event: SyncEvent;
      try {
        event = JSON.parse(e.data) as SyncEvent;
      } catch {
        return;
      }
      if (event.originClientId === clientId) return;
      if (event.type === 'pages.changed') {
        void qc.invalidateQueries({ queryKey: queryKeys.pages });
      }
      listeners.forEach((l) => l(event));
    };
    source.addEventListener('pages.changed', handle);
    source.addEventListener('page.content', handle);

    return () => source.close();
  }, [enabled, qc]);
}
