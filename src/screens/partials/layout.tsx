import { PropsWithChildren } from "react";
import { Sidebar } from "@/screens/partials/sidebar.tsx";
import { cn } from "@/lib/utils.ts";

interface Props extends PropsWithChildren {
  gap?: boolean
  overflowHidden?: boolean
  containerClassName?: string
  showSidebar?: boolean
}

export const Layout = ({
  showSidebar = true, ...props
}: Props) => {
  return (
    <div className={
      cn(
        "max-h-[calc(100vh_-_var(--app-toolbar-h))] h-[calc(100vh_-_var(--app-toolbar-h))]",
        props.overflowHidden ? 'overflow-hidden' : 'overflow-auto'
      )
    }>
      <div className="flex h-full min-h-0">
        {showSidebar && (
          <div className="flex-grow-0 flex-shrink-0 w-[130px]">
            <Sidebar/>
          </div>
        )}

        <div className={
          cn(
            "flex-auto min-h-0 h-full overflow-auto max-h-[calc(100vh_-_var(--app-toolbar-h))]",
            props.containerClassName
          )
        }>
          {props.children}
        </div>
      </div>
    </div>
  );
}
