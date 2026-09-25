import type {
  AuthResponse,
  InstanceConfig,
  PageDetail,
  PageSummary,
  SearchResult,
  User,
} from '@cotebook/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { generateKeyBetween } from 'fractional-indexing';
import { api, ApiError } from './client';

export const queryKeys = {
  config: ['config'] as const,
  me: ['me'] as const,
  pages: ['pages'] as const,
  page: (id: string) => ['page', id] as const,
  search: (q: string) => ['search', q] as const,
};

export function useInstanceConfig() {
  return useQuery({
    queryKey: queryKeys.config,
    queryFn: () => api<InstanceConfig>('/config'),
    staleTime: Infinity,
  });
}

export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return (await api<{ user: User }>('/auth/me')).user;
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string }) =>
      api<AuthResponse>('/auth/login', { method: 'POST', body: input }),
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(queryKeys.me, res.user);
    },
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; password: string; displayName?: string }) =>
      api<AuthResponse>('/auth/register', { method: 'POST', body: input }),
    onSuccess: (res) => {
      qc.clear();
      qc.setQueryData(queryKeys.me, res.user);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<void>('/auth/logout', { method: 'POST' }),
    onSettled: () => {
      qc.clear();
      qc.setQueryData(queryKeys.me, null);
    },
  });
}

export function usePages(enabled = true) {
  return useQuery({
    queryKey: queryKeys.pages,
    queryFn: async () => (await api<{ pages: PageSummary[] }>('/pages')).pages,
    enabled,
  });
}

export function usePage(id: string) {
  return useQuery({
    queryKey: queryKeys.page(id),
    queryFn: async () => (await api<{ page: PageDetail }>(`/pages/${id}`)).page,
    // The editor owns the content once loaded; remote changes are pulled explicitly.
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export function fetchPage(id: string) {
  return api<{ page: PageDetail }>(`/pages/${id}`).then((r) => r.page);
}

export function useCreatePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { parentId?: string | null; title?: string }) =>
      api<{ page: PageSummary }>('/pages', { method: 'POST', body: input }).then((r) => r.page),
    onSuccess: (page) => {
      qc.setQueryData<PageSummary[]>(queryKeys.pages, (old) => (old ? [...old, page] : [page]));
      // A new page is empty, so it can be opened without a round trip.
      qc.setQueryData<PageDetail>(queryKeys.page(page.id), {
        ...page,
        coverUrl: null,
        isLocked: false,
        createdAt: page.updatedAt,
        version: 0,
        blocks: [],
      });
    },
  });
}

export function useRenamePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) =>
      api<{ page: PageSummary }>(`/pages/${id}`, { method: 'PATCH', body: { title } }).then(
        (r) => r.page,
      ),
    onMutate: ({ id, title }) => {
      qc.setQueryData<PageSummary[]>(queryKeys.pages, (old) =>
        old?.map((p) => (p.id === id ? { ...p, title } : p)),
      );
    },
  });
}

export function useDeletePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<void>(`/pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.pages }),
  });
}

function byPosition(a: PageSummary, b: PageSummary) {
  if (a.position !== b.position) return a.position < b.position ? -1 : 1;
  return a.id < b.id ? -1 : 1;
}

export function useMovePage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, parentId, index }: { id: string; parentId: string | null; index: number }) =>
      api<{ page: PageSummary }>(`/pages/${id}/move`, {
        method: 'POST',
        body: { parentId, index },
      }),
    onMutate: async ({ id, parentId, index }) => {
      await qc.cancelQueries({ queryKey: queryKeys.pages });
      const previous = qc.getQueryData<PageSummary[]>(queryKeys.pages);
      if (previous) {
        // Optimistically compute a local sort key; the server's key replaces it on refetch.
        const siblings = previous
          .filter((p) => p.parentId === parentId && p.id !== id)
          .sort(byPosition);
        const before = siblings[index - 1]?.position ?? null;
        const after = siblings[index]?.position ?? null;
        let position: string | null = null;
        try {
          position = generateKeyBetween(before, after);
        } catch {
          position = null;
        }
        if (position) {
          qc.setQueryData<PageSummary[]>(
            queryKeys.pages,
            previous.map((p) => (p.id === id ? { ...p, parentId, position: position! } : p)),
          );
        }
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) qc.setQueryData(queryKeys.pages, context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: queryKeys.pages }),
  });
}

export function useSearch(q: string) {
  const trimmed = q.trim();
  return useQuery({
    queryKey: queryKeys.search(trimmed),
    queryFn: async () =>
      (await api<{ results: SearchResult[] }>(`/search?q=${encodeURIComponent(trimmed)}`)).results,
    enabled: trimmed.length > 0,
    placeholderData: (prev) => prev,
    staleTime: 10_000,
  });
}
