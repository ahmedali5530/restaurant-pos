import { Button } from '@/components/common/input/button';
import React, { useState } from 'react';
import { SecurityAction, SecurityManager } from '@/providers/security.provider';
import {Input} from "@/components/common/input/input.tsx";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import { useTranslation } from 'react-i18next';

interface PasswordAuthProps {
  onSuccess: (manager?: SecurityManager) => void;
  onCancel: () => void;
  currentAction?: SecurityAction | null;
}

export const PasswordAuth: React.FC<PasswordAuthProps> = ({ 
  onSuccess, 
  onCancel,
  currentAction
}) => {
  const { t } = useTranslation(['auth', 'common']);
  const db = useDB();

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const [userWithModules] = await db.query(`SELECT * FROM ${Tables.users} FETCH user_role, user_shift where deleted_at = none and $module IN user_role.roles and login_method = 'form' and crypto::bcrypt::compare(password, $password) = true `, {
      module: currentAction.module,
      password
    });

    if(userWithModules.length > 0){
      onSuccess(userWithModules[0] as SecurityManager);
    }else{
      setError(t('security.invalidPassword', { module: currentAction.module }));
    }

    setPassword('');
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          {t('security.enterPassword')}
        </label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={t('security.passwordPlaceholder')}
          autoFocus
          autoComplete="off"
          enableKeyboard
          inputSize="lg"
        />
        {error && (
          <p className="mt-1 text-sm text-danger-600">{error}</p>
        )}
      </div>

      <div className="flex space-x-3 pt-2">
        <Button
          type="button"
          onClick={onCancel}
          variant="secondary"
          className="flex-1 lg"
        >
          {t('common:actions.cancel')}
        </Button>
        <Button
          type="submit"
          className="flex-1 lg"
          variant="primary"
          active
        >
          {t('common:actions.confirm')}
        </Button>
      </div>
    </form>
  );
};
