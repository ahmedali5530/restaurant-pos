import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {faWandMagicSparkles} from "@fortawesome/free-solid-svg-icons";
import {cn} from "@/lib/utils.ts";

/** Sparkles icon used on AI Import actions. */
export function AiSparklesIcon({className}: {className?: string}) {
  return (
    <FontAwesomeIcon
      icon={faWandMagicSparkles}
      className={cn("w-4 h-4", className)}
      aria-hidden
    />
  );
}
