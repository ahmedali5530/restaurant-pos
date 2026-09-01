import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import {User} from "@/api/model/user.ts";
import { nanoid } from 'nanoid';

export type AuthType = 'pin' | 'password' | 'qrcode';
export type SecurityManager = Partial<User> | null;

export interface SecurityAction {
  id: string;
  description: string;
  authType?: AuthType;
  module?: string;
  /** When set, always show PIN/password modal (skip current-user auto-allow). */
  forceAuth?: boolean;
  /**
   * Print-limit override: accept users with Override print limit (including self),
   * or users with `alternateModule` who are not the current cashier.
   */
  alternateModule?: string;
  excludeUserId?: string;
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

  // Docs / Playwright capture: open manager re-auth UI without a real protected click.
  useEffect(() => {
    const api = {
      open: (description = 'Manager approval required') => {
        requestSecurity({
          id: nanoid(),
          description,
          forceAuth: true,
          onConfirm: () => undefined,
        });
      },
      close: () => {
        closeModal();
      },
    };
    (window as Window & { __POSR_DOCS_SECURITY__?: typeof api }).__POSR_DOCS_SECURITY__ = api;
    return () => {
      delete (window as Window & { __POSR_DOCS_SECURITY__?: typeof api }).__POSR_DOCS_SECURITY__;
    };
  }, [requestSecurity, closeModal]);

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
