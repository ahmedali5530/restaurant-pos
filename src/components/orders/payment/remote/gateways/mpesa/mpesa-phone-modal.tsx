import { memo } from "react";
import { Button } from "@/components/common/input/button.tsx";
import { Input } from "@/components/common/input/input.tsx";
import { Modal } from "@/components/common/react-aria/modal.tsx";

type Props = {
  open: boolean;
  phoneInput: string;
  onPhoneChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  isSubmitting?: boolean;
};

export const MpesaPhoneModal = memo(function MpesaPhoneModal({
  open,
  phoneInput,
  onPhoneChange,
  onConfirm,
  onCancel,
  isSubmitting,
}: Props) {
  return (
    <Modal
      open={open}
      onClose={isSubmitting ? () => {} : onCancel}
      title="M-Pesa phone number"
      size="sm"
      shouldCloseOnOverlayClick={!isSubmitting}
      shouldCloseOnEsc={!isSubmitting}
      hideCloseButton={isSubmitting}
    >
      <p className="text-sm text-neutral-600 mb-3">
        {isSubmitting
          ? "Sending STK push to the customer phone…"
          : "Enter the customer M-Pesa number to send an STK push."}
      </p>
      <Input
        label="Phone"
        value={phoneInput}
        onChange={(e) => onPhoneChange(e.target.value)}
        placeholder="2547XXXXXXXX or 07XXXXXXXX"
        enableKeyboard
        inputSize="lg"
        disabled={isSubmitting}
        readOnly={isSubmitting}
      />
      <div className="flex gap-2 mt-4">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button
          variant="primary"
          className="flex-1"
          onClick={onConfirm}
          disabled={isSubmitting}
        >
          {isSubmitting ? "Sending…" : "Send STK push"}
        </Button>
      </div>
    </Modal>
  );
});
