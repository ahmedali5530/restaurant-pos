import {Button} from "@/components/common/input/button.tsx";
import {faTrash} from "@fortawesome/free-solid-svg-icons";
import {Dialog, Heading, Modal, ModalOverlay} from 'react-aria-components';
import {AlertTriangle} from 'lucide-react';
import {useState} from "react";
import {cn} from "@/lib/utils.ts";


interface Props {
  onConfirm: () => void | Promise<void>;
  message?: string
}

export const DeleteConfirm = ({
  onConfirm, message
}: Props) => {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

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

  return (
    <>
      <Button onClick={() => setOpen(true)} icon={faTrash} variant="danger"/>
      {open && (
        <>
          <ModalOverlay
            isDismissable={!loading}
            isKeyboardDismissDisabled={loading}
            isOpen={true}
            className={
              cn(
                'fixed inset-0 w-full h-full flex items-center justify-center p-4 box-border backdrop-blur isolate'
              )
            }
          >
            <Modal
              className={({isEntering, isExiting}) => `
                sticky inset-0 w-full h-full flex items-center justify-center p-4 box-border text-center
                ${isEntering ? 'animate-in zoom-in-95 ease-out duration-300' : ''}
                ${isExiting ? 'animate-out zoom-out-95 ease-in duration-200' : ''}
              `}
              isOpen={true}
            >
              <Dialog
                role="alertdialog"
                className="max-w-md max-h-full overflow-hidden rounded-2xl bg-white p-6 box-border text-left align-middle shadow-xl outline-hidden relative min-w-[350px]"
              >
                <Heading
                  slot="title"
                  className="text-2xl font-semibold leading-6 my-0 text-neutral-700"
                >
                  Confirm deletion
                </Heading>
                <div className="w-6 h-6 text-danger-500 absolute right-6 top-6 stroke-2">
                  <AlertTriangle className="w-6 h-6"/>
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
                    Cancel
                  </Button>
                  <Button
                    className="bg-danger-500 text-white hover:border-danger-600 pressed:bg-danger-600"
                    onClick={confirm}
                    variant="danger"
                    size="lg"
                    isLoading={loading}
                    disabled={loading}
                  >
                    Confirm
                  </Button>
                </div>
              </Dialog>
            </Modal>
          </ModalOverlay>
        </>
      )}
    </>
  );
}