"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { toast } from "sonner";

import { api, errorMessage, type QueryParams } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";

/**
 * Query keys are `[resource, ...]`, so invalidating `["invoices"]` refreshes every invoice list
 * and detail after a mutation.
 */
export function usePaged<T>(
  resource: string,
  path: string,
  params: QueryParams,
  options: { enabled?: boolean } = {},
) {
  return useQuery({
    queryKey: [resource, "list", path, params],
    queryFn: ({ signal }) => api.get<Page<T>>(path, params, signal),
    placeholderData: keepPreviousData,
    enabled: options.enabled ?? true,
  });
}

export function useResource<T>(
  key: QueryKey,
  path: string | null,
  params?: QueryParams,
  options: Omit<UseQueryOptions<T>, "queryKey" | "queryFn"> = {},
) {
  return useQuery({
    queryKey: [...key, params ?? null],
    queryFn: ({ signal }) => api.get<T>(path as string, params, signal),
    enabled: path !== null && (options.enabled ?? true),
    ...options,
  });
}

/** Loads every page of a small reference list (taxes, payment terms, plans for a picker). */
export function useAllPages<T>(resource: string, path: string, params: QueryParams = {}, enabled = true) {
  return useQuery({
    queryKey: [resource, "all", path, params],
    enabled,
    staleTime: 60_000,
    queryFn: async ({ signal }) => {
      const items: T[] = [];
      for (let page = 1; page <= 20; page += 1) {
        const result = await api.get<Page<T>>(path, { ...params, page, page_size: 100 }, signal);
        items.push(...result.items);
        if (items.length >= result.total || result.items.length === 0) break;
      }
      return items;
    },
  });
}

interface MutationConfig<TVars, TResult> {
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Resource roots to refresh on success, e.g. ["invoices", "payments", "reports"]. */
  invalidate?: string[];
  success?: string | ((result: TResult, vars: TVars) => string | null);
  /** When false, the caller handles errors (e.g. mapping them onto form fields). */
  toastError?: boolean;
  onSuccess?: (result: TResult, vars: TVars) => void;
}

export function useApiMutation<TVars = void, TResult = unknown>(config: MutationConfig<TVars, TResult>) {
  const queryClient = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: config.mutationFn,
    onSuccess: async (result, vars) => {
      if (config.invalidate?.length) {
        await Promise.all(
          config.invalidate.map((resource) => queryClient.invalidateQueries({ queryKey: [resource] })),
        );
      }
      const message = typeof config.success === "function" ? config.success(result, vars) : config.success;
      if (message) toast.success(message);
      config.onSuccess?.(result, vars);
    },
    onError: (error) => {
      if (config.toastError !== false) toast.error(errorMessage(error));
    },
  });
}
