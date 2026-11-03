"use client";

import { useCallback, useRef } from "react";

/**
 * Wraps an async submit handler so a second call while the first is still running is ignored.
 *
 * Disabling a button after `isSubmitting` flips is not enough: React Hook Form validates
 * asynchronously, so a fast double-click can start two submits before the first re-render disables
 * the button (observed: two customers created by one double-click). A ref flips synchronously.
 *
 * An ignored submit event must still be cancelled: React Hook Form normally calls preventDefault(),
 * but it never runs for the dropped call, and the browser would otherwise submit the <form>
 * natively (a GET to the same page with every field in the query string).
 */
export function useSingleFlight() {
  const busy = useRef(false);
  return useCallback(
    <A extends unknown[]>(handler: (...args: A) => unknown) =>
      async (...args: A): Promise<void> => {
        if (busy.current) {
          const event = args[0] as { preventDefault?: () => void } | undefined;
          event?.preventDefault?.();
          return;
        }
        busy.current = true;
        try {
          await handler(...args);
        } finally {
          busy.current = false;
        }
      },
    [],
  );
}
