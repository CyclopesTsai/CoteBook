import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { onRemoteChange } from '../api/sync';
import { queryKeys } from '../api/queries';

/**
 * Refetches the open page when another device changes it. The editor then decides
 * whether to load the new content or to ask the user (see PageView).
 */
export function usePageSync(pageId: string) {
  const qc = useQueryClient();
  useEffect(
    () =>
      onRemoteChange((event) => {
        const affected =
          (event.type === 'page.content' && event.pageId === pageId) ||
          // After a reconnect (empty id list) we may have missed content events.
          (event.type === 'pages.changed' && event.pageIds.length === 0);
        if (affected) void qc.invalidateQueries({ queryKey: queryKeys.page(pageId) });
      }),
    [pageId, qc],
  );

  // Content events for pages that are not open just mark their cache stale.
  useEffect(
    () =>
      onRemoteChange((event) => {
        if (event.type === 'page.content' && event.pageId !== pageId) {
          void qc.invalidateQueries({
            queryKey: queryKeys.page(event.pageId),
            refetchType: 'none',
          });
        }
      }),
    [pageId, qc],
  );
}
