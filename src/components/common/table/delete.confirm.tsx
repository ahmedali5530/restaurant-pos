import {Button} from "@/components/common/input/button.tsx";
import {faTrash, faTriangleExclamation} from "@fortawesome/free-solid-svg-icons";
import {FontAwesomeIcon} from "@fortawesome/react-fontawesome";
import {Dialog, Heading, Modal, ModalOverlay, TooltipTrigger} from 'react-aria-components';
import {cloneElement, isValidElement, ReactElement, ReactNode, useState} from "react";
import {createPortal} from "react-dom";
import {cn} from "@/lib/utils.ts";
import {useTranslation} from "react-i18next";
import {Tooltip} from "@/components/common/react-aria/tooltip.tsx";


interface Props {
  onConfirm: () => void | Promise<void>;
  message?: string;
  title?: string;
  children?: ReactNode;
  /** When set, dialog open state is controlled by the parent (e.g. Switch toggles). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export const DeleteConfirm = ({
  onConfirm,
  message,
  title,
  children,
  open: openProp,
  onOpenChange,
}: Props) => {
  const {t} = useTranslation('common');
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const isControlled = openProp !== undefined;
  const open = isControlled ? openProp : uncontrolledOpen;
  const resolvedTitle = title ?? t('actions.delete');

  const setOpen = (next: boolean) => {
    if (!isControlled) {
      setUncontrolledOpen(next);
    }
    onOpenChange?.(next);
  };

  const close = () => {
    setOpen(false);
  }

  const cancel = () => {
    if (loading) {
      return;
    }
    close();
  }

  const confirm = async () => {
    if (loading) {
      return;
    }

    setLoading(true);
    try {
      await onConfirm();
    } finally {
      setLoading(false);
      close();
    }
  }

  const openDialog = () => setOpen(true);

  const hasCustomTrigger = children != null;
  const trigger = !hasCustomTrigger && !isControlled
    ? (
      <TooltipTrigger delay={0} closeDelay={0}>
        <Button
          onClick={openDialog}
          icon={faTrash}
          variant="danger"
          aria-label={t('actions.delete')}
        />
        <Tooltip>{t('actions.delete')}</Tooltip>
      </TooltipTrigger>
    )
    : hasCustomTrigger && isValidElement(children)
      ? cloneElement(children as ReactElement<any>, {
          onClick: (event: any) => {
            (children as ReactElement<any>).props?.onClick?.(event);
            if (event?.defaultPrevented) {
              return;
            }
            openDialog();
          },
        })
      : hasCustomTrigger
        ? <span onClick={openDialog}>{children}</span>
        : null;

  return (
    <>
      {trigger}
      {open && createPortal(
        <ModalOverlay
          isDismissable={!loading}
          isKeyboardDismissDisabled={loading}
          isOpen={true}
          className={cn(
            'react-aria-ModalOverlay delete-confirm-overlay !z-[1100] flex items-center justify-center p-4',
          )}
        >
          <Modal
            className={({isEntering, isExiting}) => cn(
              'w-full max-w-md outline-hidden',
              isEntering && 'animate-in zoom-in-95 ease-out duration-300',
              isExiting && 'animate-out zoom-out-95 ease-in duration-200',
            )}
            isOpen={true}
          >
            <Dialog
              role="alertdialog"
              className="max-w-md max-h-full overflow-hidden rounded-2xl bg-white p-6 box-border text-left shadow-xl relative min-w-[350px]"
            >
              <Heading
                slot="title"
                className="text-2xl font-semibold leading-6 my-0 text-neutral-700"
              >
                {resolvedTitle}
              </Heading>
              <div className="w-6 h-6 text-danger-500 absolute right-6 top-6 stroke-2">
                <FontAwesomeIcon icon={faTriangleExclamation} className="w-6 h-6"/>
              </div>
              <p className="mt-3 text-neutral-500">
                {message ? message : 'Are you sure you want to delete this? All contents will be permanently destroyed.'}
              </p>
              <div className="mt-6 flex justify-end gap-2">
                <Button
                  className="bg-neutral-200 text-neutral-800 hover:border-neutral-300 pressed:bg-neutral-300"
                  onClick={cancel}
                  size="lg"
                  disabled={loading}
                >
                  {t('actions.cancel')}
                </Button>
                <Button
                  className="bg-danger-500 text-white hover:border-danger-600 pressed:bg-danger-600"
                  onClick={confirm}
                  variant="danger"
                  size="lg"
                  isLoading={loading}
                  disabled={loading}
                >
                  {t('actions.confirm')}
                </Button>
              </div>
            </Dialog>
          </Modal>
        </ModalOverlay>,
        document.body,
      )}
    </>
  );
}
