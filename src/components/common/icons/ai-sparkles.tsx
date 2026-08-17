import {Sparkles} from "lucide-react";
import {cn} from "@/lib/utils.ts";

/** Two 4-pointed stars used on AI Import actions. */
export function AiSparklesIcon({className}: {className?: string}) {
  return <Sparkles className={cn("w-4 h-4", className)} strokeWidth={2} aria-hidden />;
}
