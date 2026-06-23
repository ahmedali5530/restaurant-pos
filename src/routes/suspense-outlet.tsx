import {Suspense} from "react";
import {Outlet} from "react-router";
import {PageLoader} from "@/components/common/loader/page-loader.tsx";

export const SuspenseOutlet = () => (
  <Suspense fallback={<PageLoader/>}>
    <Outlet/>
  </Suspense>
);
