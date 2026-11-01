"use client";

import { CheckCircle2, X } from "lucide-react";
import { useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";

/**
 * Records created in this visit, shown above a list. Lists are sorted by name, so a new record can
 * land on any page; this keeps what the user just added in view.
 */
export function useRecentlyAdded<T extends { id: number }>() {
  const [items, setItems] = useState<T[]>([]);
  return {
    items,
    add: (item: T) => setItems((current) => [item, ...current.filter((i) => i.id !== item.id)].slice(0, 5)),
    replace: (item: T) => setItems((current) => current.map((i) => (i.id === item.id ? item : i))),
    clear: () => setItems([]),
  };
}

export function RecentlyAdded<T extends { id: number }>({
  items,
  onClear,
  render,
}: {
  items: T[];
  onClear: () => void;
  render: (item: T) => ReactNode;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Added just now" className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-emerald-900">
          <CheckCircle2 className="size-4" aria-hidden /> Added just now
        </h2>
        <Button variant="ghost" size="icon-xs" onClick={onClear} aria-label="Dismiss recently added">
          <X />
        </Button>
      </div>
      <ul className="divide-y divide-emerald-100">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-1.5 text-sm">
            {render(item)}
          </li>
        ))}
      </ul>
    </section>
  );
}
