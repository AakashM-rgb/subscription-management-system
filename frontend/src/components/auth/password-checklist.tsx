import { Check, Circle } from "lucide-react";

import { PASSWORD_RULES } from "@/lib/validation";
import { cn } from "@/lib/utils";

export function PasswordChecklist({ value, id }: { value: string; id?: string }) {
  return (
    <ul id={id} className="grid grid-cols-1 gap-1 text-xs sm:grid-cols-2" aria-label="Password requirements">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.test(value);
        return (
          <li key={rule.id} className={cn("flex items-center gap-1.5", ok ? "text-emerald-700" : "text-muted-foreground")}>
            {ok ? <Check className="size-3.5" aria-hidden /> : <Circle className="size-3" aria-hidden />}
            <span>
              {rule.label}
              <span className="sr-only">{ok ? " (met)" : " (not met)"}</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
