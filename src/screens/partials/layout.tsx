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
        "max-h-[100vh] h-[100vh]",
        props.overflowHidden ? 'overflow-hidden' : 'overflow-auto'
      )
    }>
      <div className="flex">
        {showSidebar && (
          <div className="flex-grow-0 flex-shrink-0 w-[130px]">
            <Sidebar/>
          </div>
        )}

        <div className={
          cn(
            "flex-auto overflow-auto max-h-[100vh]", props.containerClassName
          )
        }>
          {props.children}
        </div>
      </div>
    </div>
  );
}
