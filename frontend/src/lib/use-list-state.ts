"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export const DEFAULT_PAGE_SIZE = 25;

/**
 * List state (page, page size, search and filters) lives in the URL so filtered views can be
 * shared, bookmarked and restored with the back button.
 */
export function useListState<F extends string>(filterKeys: readonly F[] = [], defaults: Partial<Record<F, string>> = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("page_size")) || DEFAULT_PAGE_SIZE));
  const q = searchParams.get("q") ?? "";
  const keysSignature = filterKeys.join(",");

  const filters = useMemo(() => {
    const out = {} as Record<F, string>;
    for (const key of keysSignature ? (keysSignature.split(",") as F[]) : []) {
      out[key] = searchParams.get(key) ?? defaults[key] ?? "";
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, keysSignature]);

  const update = useCallback(
    (changes: Record<string, string | number | null | undefined>, resetPage = true) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (value === null || value === undefined || value === "") next.delete(key);
        else next.set(key, String(value));
      }
      if (resetPage && !("page" in changes)) next.delete("page");
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const clear = useCallback(() => router.replace(pathname, { scroll: false }), [pathname, router]);

  const hasFilters = q !== "" || (keysSignature ? keysSignature.split(",") : []).some((k) => searchParams.get(k));

  return {
    page,
    pageSize,
    q,
    filters,
    hasFilters,
    setPage: (value: number) => update({ page: value <= 1 ? null : value }, false),
    setPageSize: (value: number) => update({ page_size: value === DEFAULT_PAGE_SIZE ? null : value }),
    setSearch: (value: string) => update({ q: value }),
    setFilter: (key: F, value: string) => update({ [key]: value }),
    update,
    clear,
  };
}
