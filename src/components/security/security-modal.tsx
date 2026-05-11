import React, {useState} from 'react';
import {AuthType, SecurityManager, useSecurityContext} from '@/providers/security.provider';
import {PinAuth} from './auth/pin-auth';
import {PasswordAuth} from './auth/password-auth';
import {QrCodeAuth} from './auth/qrcode-auth.tsx';
import {Modal} from '../common/react-aria/modal';
import {Button} from '../common/input/button';

export const SecurityModal = () => {
  const {
    isModalOpen,
    currentAction,
    confirmAction,
    cancelAction,
    availableAuthTypes
  } = useSecurityContext();

  const [selectedAuthType, setSelectedAuthType] = useState<AuthType>('pin');

  if (!isModalOpen || !currentAction) {
    return null;
  }

  const handleAuthSuccess = (manager?: SecurityManager) => {
    confirmAction(manager);
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
        return 'PIN';
      case 'password':
        return 'Password';
      case 'qrcode':
        return 'QR Code';
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
