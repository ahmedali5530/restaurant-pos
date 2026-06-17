import React from "react";
import {useAtom} from "jotai";
import {appAlert} from "@/store/jotai.ts";
import {Modal} from "@/components/common/react-aria/modal.tsx";
import colors from 'tailwindcss/colors';
import { useTranslation } from "react-i18next";


export const Alert = () => {
  const [state, setState] = useAtom(appAlert);
  const { t } = useTranslation('common');

  const closeDialog = async () => {
    setState(prev => ({
      ...prev,
      opened: false,
      message: '',
    }))
  }

  const color = () => {
    switch (state.type) {
      case "success":
        return colors.green[200];
      case "error":
        return colors.red[200];
      case "warning":
        return colors.yellow[200];
      case "info":
        return colors.blue[200];
      default:
        return colors.white;
    }
  }

  return (
    <Modal
      title={t(`actions.${state.type}`)}
      shouldCloseOnOverlayClick
      open={state.opened}
      size="sm"
      onClose={closeDialog}
      shouldCenter
      backgroundColor={color()}
    >
      <p className="p-5 text-center text-2xl">{state.message}</p>
    </Modal>
  );
};