import React, { FunctionComponent, PropsWithChildren, ReactNode, useEffect, useState, } from "react";
import { Dialog, Heading, Modal as ReactAriaModal, ModalOverlay } from 'react-aria-components';
import { faTimes } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { cn } from "@/lib/utils.ts";
import {createPortal} from "react-dom";

interface ModalProps extends PropsWithChildren {
  open?: boolean;
  onClose?: () => void;
  title?: ReactNode;
  shouldCloseOnOverlayClick?: boolean;
  shouldCloseOnEsc?: boolean;
  hideCloseButton?: boolean;
  transparentContainer?: boolean;
  header?: ReactNode;
  size?: "full" | "sm" | "md" | "lg" | "xl" | 'auto';
  backdrop?: boolean;
  shouldCenter?: boolean;
  backgroundColor?: string
  bottomSheet?: boolean
}

export const Modal: FunctionComponent<ModalProps> = ({
  hideCloseButton = false,
  size = 'md',
  ...props
}) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if( typeof props.open !== "undefined" ) {
      setOpen(props.open);
    }
  }, [props.open]);

  const close = (isOpen: boolean) => {
    if(!isOpen) {
      setOpen(false);
      props.onClose!();
    }
  };

  return (
    <>
      {createPortal(
        <ModalOverlay
          isDismissable={props.shouldCloseOnOverlayClick === undefined ? true : props.shouldCloseOnOverlayClick}
          isKeyboardDismissDisabled={props.shouldCloseOnEsc === undefined ? true : props.shouldCloseOnEsc}
          isOpen={open}
          onOpenChange={close}
          className={
            cn(
              'react-aria-ModalOverlay',
              props.bottomSheet ? 'bottom-sheet' : ''
            )
          }
        >
          <ReactAriaModal
            // isOpen={open}
            // isDismissable={props.shouldCloseOnOverlayClick === undefined ? true : props.shouldCloseOnOverlayClick}
            // isKeyboardDismissDisabled={props.shouldCloseOnEsc === undefined ? true : props.shouldCloseOnEsc}
            // onOpenChange={close}
            className={cn(
              'react-aria-Modal',
              props.bottomSheet ? 'mb-12' : ''
            )}
          >
            <Dialog
              className={cn(
                'react-aria-Dialog',
                size === "full" && "modal-full",
                size === "sm" && "modal-sm",
                size === 'lg' && 'modal-lg',
                size === 'xl' && 'modal-xl',
                size === "md" && 'modal-md',
                !props.backdrop && 'no-backdrop'
              )}
            >
              <div style={{
                backgroundColor: props.backgroundColor ?? 'rgb(255, 255, 255)',
                backdropFilter: 'blur(10px)'
              }} className="rounded-lg">
                {hideCloseButton !== true && (
                  <button
                    onClick={() => close(false)}
                    className="btn btn-secondary btn-flat btn-square absolute top-2 right-2 lg rounded inline-flex justify-center items-center"
                    type="button">
                    <FontAwesomeIcon icon={faTimes} size="lg"/>
                  </button>
                )}

                <div className="p-5 border-b border-neutral-100">
                  <Heading slot="title" className="text-2xl">{props?.title}</Heading>
                  {props.header && props.header}
                </div>
                <div
                  className="pb-5 modal-container px-5 py-3 bg-neutral-100 overflow-auto"
                >
                  {props.children}
                </div>
              </div>
            </Dialog>
          </ReactAriaModal>
        </ModalOverlay>,
        document.body
      )}
    </>
  );
};
