import { Tab as BaseTab, TabPanel as BaseTabPanel, TabPanelProps, TabProps } from "react-aria-components";
import { CSSProperties } from "react";
import { cn } from "@/lib/utils.ts";

export function Tab(orgProps: TabProps & {
  activeClass?: string
}) {
  const {activeClass = 'bg-gradient', ...props} = orgProps;

  return (
    <BaseTab
      {...props}
      className={({ isSelected }) => `
        rounded-full cursor-pointer pressable !h-[46px] inline-flex items-center justify-center p-[0.75rem] outline-0 whitespace-nowrap px-5 active:shadow-none
        ${isSelected ? `${activeClass} shadow-xl` : 'text-neutral-900 border-[3px] border-transparent bg-neutral-100'}
      `}
      style={{
        '--scale': '0.95',
        '--padding': '1.25rem'
      } as CSSProperties}
    />
  );
}

export function TabPanel(props: TabPanelProps) {
  return (
    <BaseTabPanel
      {...props}
      className={cn(
        "mt-2 p-2 outline-none",
        props.className
      )}
    />
  );
}
