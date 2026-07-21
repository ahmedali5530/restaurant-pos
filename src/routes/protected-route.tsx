import {useAtomValue} from "jotai";
import {Navigate, Outlet, useLocation} from "react-router";
import {appPage} from "@/store/jotai.ts";
import {LOGIN} from "@/routes/posr.ts";
import {WhatsNewDialog} from "@/components/whats-new/whats-new.dialog.tsx";
import {getSessionToken, isGatewayAuthEnabled} from "@/lib/session.ts";

export const ProtectedRoute = () => {
  const {user} = useAtomValue(appPage);
  const location = useLocation();

  if (!user) {
    return <Navigate to={LOGIN} replace state={{from: location}}/>;
  }

  if (isGatewayAuthEnabled() && !getSessionToken()) {
    return <Navigate to={LOGIN} replace state={{from: location}}/>;
  }

  return (
    <>
      <Outlet/>
      <WhatsNewDialog/>
    </>
  );
};
