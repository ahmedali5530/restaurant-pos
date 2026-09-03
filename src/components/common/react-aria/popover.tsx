import { Dialog, OverlayArrow, Popover as BasePopover, PopoverProps } from 'react-aria-components';
import React from "react";

interface MyPopoverProps extends Omit<PopoverProps, 'children'> {
  children: React.ReactNode;
}

export function Popover({ children, ...props }: MyPopoverProps) {
  return (
    <BasePopover
      {...props}
      className={({ isEntering, isExiting }) => `
        placement-bottom:mt-2 placement-top:mb-2 group rounded-lg shadow-2xl ring-1 ring-black/10 bg-white
        ${
        isEntering
          ? 'animate-in fade-in placement-bottom:slide-in-from-top-1 placement-top:slide-in-from-bottom-1 ease-out duration-200'
          : ''
      }
        ${
        isExiting
          ? 'animate-out fade-out placement-bottom:slide-out-to-top-1 placement-top:slide-out-to-bottom-1 ease-in duration-150'
          : ''
      }
      `}
    >
      <OverlayArrow>
        <svg
          viewBox="0 0 12 12"
          className="block fill-white group-placement-bottom:rotate-180 w-4 h-4"
        >
          <path d="M0 0L6 6L12 0"/>
        </svg>
      </OverlayArrow>
      <Dialog className="p-2 outline-none text-gray-700">
        {children}
      </Dialog>
    </BasePopover>
  );
}
