import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import {User} from "@/api/model/user.ts";

export type AuthType = 'pin' | 'password' | 'qrcode';
export type SecurityManager = Partial<User> | null;

export interface SecurityAction {
  id: string;
  description: string;
  authType?: AuthType;
  module?: string;
  onConfirm: (manager?: SecurityManager, usedAuthType?: AuthType) => void;
  onCancel?: () => void;
  onError?: () => void;
  payload?: any
}

interface SecurityContextType {
  isModalOpen: boolean;
  currentAction: SecurityAction | null;
  requestSecurity: (action: SecurityAction) => void;
  confirmAction: (manager?: SecurityManager, usedAuthType?: AuthType) => void;
  cancelAction: () => void;
  isAuthenticated: boolean;
  setAuthenticated: (authenticated: boolean) => void;
  availableAuthTypes: AuthType[];
}

const SecurityContext = createContext<SecurityContextType | undefined>(undefined);

export const useSecurityContext = () => {
  const context = useContext(SecurityContext);
  if (!context) {
    throw new Error('useSecurityContext must be used within a SecurityProvider');
  }
  return context;
};

interface SecurityProviderProps {
  children: ReactNode;
  defaultPin?: string;
  defaultPassword?: string;
  defaultAdminCode?: string;
  availableAuthTypes?: AuthType[];
}

export const SecurityProvider: React.FC<SecurityProviderProps> = ({ 
  children,
  availableAuthTypes = ['pin', 'password', 'qrcode']
}) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentAction, setCurrentAction] = useState<SecurityAction | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const requestSecurity = useCallback((action: SecurityAction) => {
    setCurrentAction(action);
    setIsModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
    setCurrentAction(null);
    setIsAuthenticated(false);
  }, []);

  const confirmAction = useCallback((manager?: SecurityManager, usedAuthType?: AuthType) => {
    if (currentAction) {
      currentAction.onConfirm(manager, usedAuthType ?? currentAction.authType);
    }
    closeModal();
  }, [closeModal, currentAction]);

  const cancelAction = useCallback(() => {
    if (currentAction?.onCancel) {
      currentAction.onCancel();
    }
    closeModal();
  }, [closeModal, currentAction]);

  const setAuthenticated = useCallback((authenticated: boolean) => {
    setIsAuthenticated(authenticated);
  }, []);

  const value: SecurityContextType = {
    isModalOpen,
    currentAction,
    requestSecurity,
    confirmAction,
    cancelAction,
    isAuthenticated,
    setAuthenticated,
    availableAuthTypes,
  };

  return (
    <SecurityContext.Provider value={value}>
      {children}
    </SecurityContext.Provider>
  );
};
