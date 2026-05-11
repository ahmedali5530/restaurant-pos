import React, {useEffect, useState} from 'react';
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

interface QrCodeAuthProps {
  onSuccess: (manager?: SecurityManager) => void;
  onCancel: () => void;
  currentAction?: SecurityAction | null;
}

export const QrCodeAuth: React.FC<QrCodeAuthProps> = ({
  onSuccess, 
  onCancel,
  currentAction
}) => {
  const [error, setError] = useState('');
  const [token, setToken] = useState<string>();
  const [{user}] = useAtom(appPage);

  const db = useDB();

  useEffect(() => {
    (async () => {
      const code = nanoid(128);
      setToken(code);

      await db.insert(Tables.auth_permission, {
        token: code,
        created_by: toRecordId(user.id),
        title: currentAction.description,
        state: AuthState.pending,
        payload: {
          module: currentAction.module,
          description: currentAction.description,
          ...currentAction.payload
        }
      });
    })()
  }, []);

  const [liveQuery, setLiveQuery] = useState<LiveSubscription | null>(null);
  const runLiveQuery = async () => {
    const result = await db.live<AuthPermission>(Tables.auth_permission, function (action, result) {
      // delete or adding new orders will result in new data
      if (action === 'UPDATE') {
        if(result.state === AuthState.approved){
          onSuccess(result.approved_by || undefined);
        }else if(result.state === AuthState.rejected){
          setError(`Permission to ${currentAction.description} has been rejected`);
        }
      }
    });

    setLiveQuery(result);
  }

  useEffect(() => {
    runLiveQuery().then();

    return () => {
      liveQuery?.kill().then(() => console.log('live query killed')).catch(() => undefined);
    }
  },[onCancel, onSuccess]);

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-medium text-gray-900 mb-2">
          QR Code Authentication
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          Scan this QR Code with your manager App
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
