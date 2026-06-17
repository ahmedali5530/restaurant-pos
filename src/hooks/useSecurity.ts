import React, { useCallback } from 'react';
import { useSecurityContext, AuthType, SecurityManager } from '@/providers/security.provider';
import { nanoid } from 'nanoid';
import {toRecordId} from "@/lib/utils.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {useDB} from "@/api/db/db.ts";
import {getTrackingUserFields, postTracking, withOrderTrackingPayload} from "@/lib/tracking.service.ts";

export interface ProtectedActionOptions {
  description: string;
  authType?: AuthType;
  module?: string;
  orderId?: string;
  onSuccess?: (manager?: SecurityManager) => void;
  onCancel?: () => void;
  onError?: () => void;
  payload?: any
}

export const useSecurity = () => {
  const { requestSecurity } = useSecurityContext();
  const [{user, page}] = useAtom(appPage);
  const db = useDB();

  const getManagerId = useCallback((manager?: SecurityManager) => {
    if(!manager){
      return undefined;
    }

    const managerId = `${manager?.first_name} ${manager?.last_name}`;

    if (!managerId) return undefined;

    return managerId;
  }, []);

  const trackProtectActionSuccess = useCallback((options: ProtectedActionOptions, authMethod: string, manager?: SecurityManager) => {
    void postTracking({
      auth_method: authMethod,
      manager: getManagerId(manager),
      manager_role: manager?.user_role?.name || manager?.role?.name,
      module: options.module,
      page,
      payload: withOrderTrackingPayload(options.payload, options.orderId),
      ...getTrackingUserFields(user),
    });
  }, [getManagerId, page, user?.id, user?.role?.name, user?.user_role?.name, user?.user_shift?.name]);

  const protectAction = useCallback(async (
    action: () => void,
    options: ProtectedActionOptions
  ) => {
    const { description, authType = 'pin', module, onSuccess, onCancel, onError, payload } = options;

    const [userWithModules] = await db.query(`SELECT * FROM ONLY ${toRecordId(user?.id)} WHERE deleted_at = none FETCH user_role`);
    if(userWithModules?.user_role?.roles.includes(module)){

      action();
      onSuccess?.();
      trackProtectActionSuccess(options, 'auto');
      return;
    }

    requestSecurity({
      id: nanoid(),
      description,
      authType,
      module,
      onConfirm: (manager?: SecurityManager, usedAuthType?: AuthType) => {
        action();
        onSuccess?.(manager);
        trackProtectActionSuccess(options, usedAuthType ?? authType, manager);
      },
      onCancel,
      onError,
      payload
    });
  }, [db, requestSecurity, trackProtectActionSuccess, user?.id]);

  const protectFormSubmit = useCallback((
    submitHandler: (e: React.FormEvent) => void,
    options: ProtectedActionOptions
  ) => {
    return (e: React.FormEvent) => {
      e.preventDefault();
      protectAction(() => submitHandler(e), options);
    };
  }, [protectAction]);

  return {
    protectAction,
    protectFormSubmit,
  };
};
