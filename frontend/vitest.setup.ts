import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { toast } from "sonner";
import { afterEach } from "vitest";

afterEach(() => {
  // Sonner keeps toasts in a module-level store; clear it so one test's toast can't leak into the next.
  toast.dismiss();
  cleanup();
});
