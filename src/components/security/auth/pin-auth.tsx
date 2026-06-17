import { Button } from '@/components/common/input/button';
import React, { useState, useEffect } from 'react';
import { SecurityAction, SecurityManager } from '@/providers/security.provider';
import {cn} from "@/lib/utils.ts";
import {useDB} from "@/api/db/db.ts";
import {Tables} from "@/api/db/tables.ts";
import { useTranslation } from 'react-i18next';

interface PinAuthProps {
  onSuccess: (manager?: SecurityManager) => void;
  onCancel: () => void;
  currentAction?: SecurityAction | null;
}

export const PinAuth: React.FC<PinAuthProps> = ({ 
  onSuccess, 
  onCancel, 
  currentAction
}) => {
  const { t } = useTranslation('auth');
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const db = useDB();

  const handleNumberClick = (num: string) => {
    if (pin.length < 4) {
      setPin(prev => prev + num);
      setError('');
    }
  };

  const handleClear = () => {
    setPin('');
    setError('');
  };

  const handleDelete = () => {
    setPin(prev => prev.slice(0, -1));
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    await validatePIN();
  };

  const validatePIN = async () => {
    const [userWithModules] = await db.query(`SELECT * FROM ${Tables.users} where deleted_at = none and $module IN user_role.roles and login_method = 'pin' and login = $pin and crypto::bcrypt::compare(password, $pin) = true FETCH user_role, user_shift`, {
      module: currentAction.module,
      pin
    });

    if(userWithModules.length > 0){
      onSuccess(userWithModules[0] as SecurityManager);
    }else{
      setError(t('security.invalidPin', { module: currentAction?.module }));
    }

    setPin('');
  }

  const handleKeyPress = (key: string) => {
    switch (key) {
      case 'Enter':
        handleSubmit({ preventDefault: () => {} } as React.FormEvent);
        break;
      case 'Escape':
        onCancel();
        break;
      case 'Backspace':
        handleDelete();
        break;
      default:
        if (/^[0-9]$/.test(key)) {
          handleNumberClick(key);
        }
        break;
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', (e) => handleKeyPress(e.key));
    return () => document.removeEventListener('keydown', (e) => handleKeyPress(e.key));
  }, []);

  useEffect(() => {
    if(pin.length === 4){
      validatePIN();
    }
  }, [pin]);

  const btnClasses = 'size-[60px] sm:size-[60px] md:size-[90px] p-0 text-neutral-900 transition-all duration-75 bg-neutral-100 rounded-full text-3xl';

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        {/*{error && (*/}
        {/*  <div className="my-4 alert alert-danger">{error}</div>*/}
        {/*)}*/}
        
        {/* PIN Dots Display */}
        <div className={
          cn("flex justify-center space-x-2 mb-6", !!error && 'login-error')
        }>
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                i < pin.length 
                  ? 'bg-gray-900 border-gray-900' 
                  : 'bg-gray-100 border-gray-300'
              }`}
            >
              {i < pin.length && (
                <div className="w-3 h-3 bg-white rounded-full" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Numeric Keypad */}
      <div className="flex justify-center ">
        <div className="wrapper w-[300px]">
          <div className="grid grid-cols-3 gap-2 sm:gap-5 place-items-center">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((num) => (
              <button
                key={num}
                type="button"
                onClick={() => handleNumberClick(num)}
                className={btnClasses}
              >
                {num}
              </button>
            ))}
            
            <button
              type="button"
              onClick={handleDelete}
              className={
                cn(btnClasses, 'bg-danger-500 pressable text-white')
              }
            >
              ←
            </button>
            
            <button
              type="button"
              onClick={() => handleNumberClick('0')}
              className={btnClasses}
            >
              0
            </button>
            
            <button
              type="button"
              onClick={handleClear}
              className={
                cn(btnClasses, 'bg-danger-500 pressable text-white')
              }
            >
              C
            </button>
          </div>
        </div>
      </div>

      {/*<div className="mx-auto flex space-x-3 pt-5 w-[400px] mt-5">*/}
      {/*  <Button*/}
      {/*    type="button"*/}
      {/*    onClick={onCancel}*/}
      {/*    variant="secondary"*/}
      {/*    className="flex-1 lg"*/}
      {/*  >*/}
      {/*    Cancel*/}
      {/*  </Button>*/}
      {/*  <Button*/}
      {/*    type="submit"*/}
      {/*    className="flex-1 lg"*/}
      {/*    variant="primary"*/}
      {/*    active*/}
      {/*  >*/}
      {/*    Confirm*/}
      {/*  </Button>*/}
      {/*</div>*/}
    </form>
  );
};
