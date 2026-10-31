import { SearchX } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/feedback";
import { Button } from "@/components/ui/button";

export default function ConsoleNotFound() {
  return (
    <EmptyState
      icon={SearchX}
      title="Page not found"
      description="The page you were looking for doesn't exist or has moved."
      action={
        <Button asChild>
          <Link href="/console">Back to dashboard</Link>
        </Button>
      }
    />
  );
}
