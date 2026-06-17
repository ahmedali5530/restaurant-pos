import React, {useEffect, useState} from 'react';
import {AuthType, SecurityManager, useSecurityContext} from '@/providers/security.provider';
import {PinAuth} from './auth/pin-auth';
import {PasswordAuth} from './auth/password-auth';
import {QrCodeAuth} from './auth/qrcode-auth.tsx';
import {Modal} from '../common/react-aria/modal';
import {Button} from '../common/input/button';
import { useTranslation } from 'react-i18next';

export const SecurityModal = () => {
  const { t } = useTranslation('auth');
  const {
    isModalOpen,
    currentAction,
    confirmAction,
    cancelAction,
    availableAuthTypes
  } = useSecurityContext();

  const [selectedAuthType, setSelectedAuthType] = useState<AuthType>('pin');

  useEffect(() => {
    if (isModalOpen && currentAction) {
      setSelectedAuthType(currentAction.authType ?? 'pin');
    }
  }, [isModalOpen, currentAction?.id, currentAction?.authType]);

  if (!isModalOpen || !currentAction) {
    return null;
  }

  const handleAuthSuccess = (manager?: SecurityManager) => {
    confirmAction(manager, selectedAuthType);
  };

  const handleAuthCancel = () => {
    cancelAction();
  };

  const renderAuthComponent = () => {
    switch (selectedAuthType) {
      case 'pin':
        return (
          <PinAuth
            onSuccess={handleAuthSuccess}
            onCancel={handleAuthCancel}
            currentAction={currentAction}
          />
        );
      case 'password':
        return (
          <PasswordAuth
            onSuccess={handleAuthSuccess}
            onCancel={handleAuthCancel}
            currentAction={currentAction}
          />
        );
      case 'qrcode':
        return (
          <QrCodeAuth
            onSuccess={handleAuthSuccess}
            onCancel={handleAuthCancel}
            currentAction={currentAction}
          />
        );
      default:
        return (
          <PinAuth
            onSuccess={handleAuthSuccess}
            onCancel={handleAuthCancel}
            currentAction={currentAction}
          />
        );
    }
  };

  const getAuthTypeLabel = (type: AuthType) => {
    switch (type) {
      case 'pin':
        return t('security.pin');
      case 'password':
        return t('security.password');
      case 'qrcode':
        return t('security.qrcode');
      default:
        return type;
    }
  };

  return (
    <Modal
      open
      onClose={handleAuthCancel}
      title={currentAction.description}
    >
      <div className="bg-white rounded-lg p-6 max-w-full mx-4">
        <div className="mb-4">
          {/* Auth Type Selector */}
          {availableAuthTypes.length > 1 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {availableAuthTypes.map((authType) => (
                <Button
                  key={authType}
                  onClick={() => setSelectedAuthType(authType)}
                  variant={selectedAuthType === authType ? 'primary' : 'secondary'}
                  size="lg"
                  active={selectedAuthType === authType}
                  className="min-w-[120px] flex-1"
                >
                  {getAuthTypeLabel(authType)}
                </Button>
              ))}
            </div>
          )}
        </div>

        {/* Auth Component */}
        <div className="mb-4">
          {renderAuthComponent()}
        </div>
      </div>
    </Modal>
  );
};
