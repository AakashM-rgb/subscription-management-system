"use client";

import { ChevronsUpDown, KeyRound, LogOut } from "lucide-react";
import Link from "next/link";

import { useLogout, useSession } from "@/components/session";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { initials } from "@/lib/format";
import { ROLE_LABEL } from "@/lib/permissions";
import { cn } from "@/lib/utils";

export function UserMenu({ variant = "light", accountHref }: { variant?: "light" | "dark"; accountHref: string }) {
  const user = useSession();
  const { logout, pending } = useLogout();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left outline-none focus-visible:ring-2",
          variant === "dark"
            ? "text-sidebar-foreground hover:bg-sidebar-accent focus-visible:ring-sidebar-ring"
            : "hover:bg-muted focus-visible:ring-ring",
        )}
      >
        <Avatar className="size-8">
          <AvatarFallback className="bg-indigo-100 text-xs font-semibold text-indigo-800">
            {initials(user.full_name)}
          </AvatarFallback>
        </Avatar>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-medium">{user.full_name}</span>
          <span className={cn("block truncate text-xs", variant === "dark" ? "text-sidebar-muted" : "text-muted-foreground")}>
            {ROLE_LABEL[user.role]}
          </span>
        </span>
        <span className="sr-only">, open account menu</span>
        <ChevronsUpDown className="size-4 shrink-0 opacity-60" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="font-normal">
          <p className="truncate text-sm font-medium">{user.full_name}</p>
          <p className="truncate text-xs text-muted-foreground">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href={accountHref}>
            <KeyRound /> Account & password
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void logout()} disabled={pending} variant="destructive">
          <LogOut /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
