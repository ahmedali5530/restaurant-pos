import {useAtomValue} from "jotai";
import {Navigate, Outlet} from "react-router";
import {appPage} from "@/store/jotai.ts";
import {LOGIN} from "@/routes/posr.ts";

export const ProtectedRoute = () => {
  const {user} = useAtomValue(appPage);

  if (!user) {
    return <Navigate to={LOGIN} replace />;
  }

  return <Outlet />;
};
