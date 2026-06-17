import React, {useEffect, useRef, useState} from 'react';
import {SecurityAction, SecurityManager} from '@/providers/security.provider';
import QRCode from "react-qr-code";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import {useAtom} from "jotai";
import {appPage} from "@/store/jotai.ts";
import {toRecordId} from "@/lib/utils.ts";
import {AuthPermission, AuthState} from "@/api/model/auth_permission.ts";
import {nanoid} from "nanoid";
import {LiveSubscription} from "surrealdb";
import { useTranslation } from 'react-i18next';

interface QrCodeAuthProps {
  onSuccess: (manager?: SecurityManager) => void;
  onCancel: () => void;
  currentAction?: SecurityAction | null;
}

export const QrCodeAuth: React.FC<QrCodeAuthProps> = ({
  onSuccess,
  currentAction
}) => {
  const { t } = useTranslation('auth');
  const [error, setError] = useState('');
  const [token, setToken] = useState<string>();
  const [{user}] = useAtom(appPage);

  const db = useDB();
  const liveQueryRef = useRef<LiveSubscription | null>(null);
  const onSuccessRef = useRef(onSuccess);
  const currentActionRef = useRef(currentAction);

  onSuccessRef.current = onSuccess;
  currentActionRef.current = currentAction;

  const resolveApprover = async (
    approvedBy: AuthPermission['approved_by']
  ): Promise<SecurityManager | undefined> => {
    if (!approvedBy) {
      return undefined;
    }

    if (
      typeof approvedBy === 'object' &&
      approvedBy.first_name &&
      approvedBy.last_name
    ) {
      return approvedBy as SecurityManager;
    }

    const approverId =
      typeof approvedBy === 'string' ? approvedBy : toRecordId(approvedBy).toString();

    if (!approverId) {
      return undefined;
    }

    const [approver] = await db.query(
      `SELECT * FROM ONLY ${toRecordId(approverId)} WHERE deleted_at = none FETCH user_role, user_shift`
    );

    return approver as SecurityManager | undefined;
  };

  useEffect(() => {
    if (!currentAction) {
      return;
    }

    let cancelled = false;
    const action = currentAction;
    const code = nanoid(64);

    setError('');
    setToken(code);

    const setup = async () => {
      await db.insert(Tables.auth_permission, {
        token: code,
        created_by: toRecordId(user.id),
        title: action.description,
        state: AuthState.pending,
        payload: {
          module: action.module,
          description: action.description,
          ...action.payload
        }
      });

      if (cancelled) {
        return;
      }

      await liveQueryRef.current?.kill().catch(() => undefined);
      liveQueryRef.current = null;

      const subscription = await db.live<AuthPermission>(
        Tables.auth_permission,
        (liveAction, result) => {
          if (result.token !== code) {
            return;
          }

          if (liveAction === 'UPDATE') {
            if (result.state === AuthState.approved) {
              void resolveApprover(result.approved_by).then((manager) => {
                onSuccessRef.current(manager);
              });
            } else if (result.state === AuthState.rejected) {
              setError(
                t('security.permissionRejected', {
                  description: currentActionRef.current?.description ?? action.description,
                })
              );
            }
          }
        }
      );

      if (cancelled) {
        await subscription.kill().catch(() => undefined);
        return;
      }

      liveQueryRef.current = subscription;
    };

    setup().catch(() => undefined);

    return () => {
      cancelled = true;
      liveQueryRef.current?.kill().catch(() => undefined);
      liveQueryRef.current = null;
    };
  }, [currentAction?.id, user.id]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          {t('security.qrcodeTitle')}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t('security.qrcodeHint')}
        </p>

        {error && (
          <p className="alert alert-danger mb-4">{error}</p>
        )}

        <div className="mx-auto flex items-center justify-center mb-4">
          {token && (
            <QRCode value={`posr-auth://${token}`}/>
          )}
        </div>
      </div>
    </div>
  );
};
