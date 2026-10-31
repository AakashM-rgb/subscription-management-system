"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, errorMessage, type QueryParams } from "@/lib/api/client";
import type { Page } from "@/lib/api/types";
import { cn } from "@/lib/utils";

/**
 * Server-searched picker for large lists (customers, invoices). Only the first 20 matches are
 * fetched per keystroke, so it stays fast with thousands of records.
 */
export function EntityCombobox<T extends { id: number }>({
  id,
  resource,
  path,
  params,
  value,
  onChange,
  getLabel,
  getDescription,
  selectedLabel,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  invalid,
  disabled,
}: {
  id?: string;
  resource: string;
  path: string;
  params?: QueryParams;
  value: string;
  onChange: (value: string, item: T | null) => void;
  getLabel: (item: T) => string;
  getDescription?: (item: T) => string | null | undefined;
  selectedLabel?: string | null;
  placeholder?: string;
  searchPlaceholder?: string;
  invalid?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [label, setLabel] = useState<string | null>(selectedLabel ?? null);

  const [syncedLabel, setSyncedLabel] = useState(selectedLabel);
  if (selectedLabel !== syncedLabel) {
    setSyncedLabel(selectedLabel);
    setLabel(selectedLabel ?? null);
  }
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 250);
    return () => clearTimeout(timer);
  }, [search]);

  const query = useQuery({
    queryKey: [resource, "search", path, params ?? null, debounced],
    queryFn: ({ signal }) => api.get<Page<T>>(path, { ...params, q: debounced || undefined, page_size: 20 }, signal),
    enabled: open,
    staleTime: 30_000,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          className={cn("h-9 w-full justify-between bg-background px-3 font-normal", !value && "text-muted-foreground")}
        >
          <span className="truncate">{value ? (label ?? `#${value}`) : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-72 p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder={searchPlaceholder} value={search} onValueChange={setSearch} />
          <CommandList>
            {query.isFetching && !query.data ? (
              <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> Searching…
              </div>
            ) : query.error ? (
              <div className="px-3 py-4 text-sm text-destructive">{errorMessage(query.error)}</div>
            ) : (
              <CommandEmpty>No matches.</CommandEmpty>
            )}
            <CommandGroup>
              {(query.data?.items ?? []).map((item) => (
                <CommandItem
                  key={item.id}
                  value={String(item.id)}
                  onSelect={() => {
                    setLabel(getLabel(item));
                    onChange(String(item.id), item);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("size-4", value === String(item.id) ? "opacity-100" : "opacity-0")} />
                  <div className="min-w-0">
                    <p className="truncate">{getLabel(item)}</p>
                    {getDescription?.(item) ? (
                      <p className="truncate text-xs text-muted-foreground">{getDescription(item)}</p>
                    ) : null}
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
