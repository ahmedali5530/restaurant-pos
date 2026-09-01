import {OverlayArrow, Tooltip as BaseTooltip} from 'react-aria-components';
import type {TooltipProps} from 'react-aria-components';
import {ReactNode} from "react";
import {cn} from "@/lib/utils.ts";

interface MyTooltipProps extends Omit<TooltipProps, 'children'> {
  children: ReactNode;
  className?: string;
}

export function Tooltip({children, className, ...props}: MyTooltipProps) {
  return (
    <BaseTooltip
      {...props}
      offset={8}
      className={cn(
        'react-aria-Tooltip z-[1200]',
        'bg-neutral-900 text-white border border-neutral-900',
        'px-3 py-1.5 text-sm font-medium rounded-lg shadow-lg',
        'outline-none',
        className,
      )}
    >
      <OverlayArrow>
        <svg
          width={10}
          height={10}
          viewBox="0 0 10 10"
          className="block fill-neutral-900 stroke-neutral-900"
        >
          <path d="M0 0 L5 5 L10 0"/>
        </svg>
      </OverlayArrow>
      {children}
    </BaseTooltip>
  );
}
