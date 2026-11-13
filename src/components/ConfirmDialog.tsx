import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";
import { useSessionStore } from "../stores/sessionStore";

/**
 * Asks before something that cannot be taken back. The button names the
 * action. Escape, a click outside, or Cancel all decline.
 */
export function ConfirmDialog() {
  const request = useSessionStore((s) => s.confirm);
  const setConfirm = useSessionStore((s) => s.setConfirm);
  const [checked, setChecked] = useState(false);
  useEffect(() => setChecked(request?.option?.checked ?? false), [request]);

  return (
    <Dialog.Root open={request !== null} onOpenChange={(open) => !open && setConfirm(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card confirm-dialog" role="alertdialog" aria-describedby="confirm-message">
          <Dialog.Title className="visually-hidden">Confirm</Dialog.Title>
          <p id="confirm-message" className="confirm-message">
            {request?.message}
          </p>
          {request?.option && (
            <label className="confirm-option">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              {request.option.label}
            </label>
          )}
          <div className="dialog-buttons">
            <button type="button" className="dialog-btn" onClick={() => setConfirm(null)}>
              Cancel
            </button>
            <button
              type="button"
              className={`dialog-btn ${request?.danger ? "dialog-btn-danger" : "dialog-btn-primary"}`}
              autoFocus
              onClick={() => {
                request?.onYes(checked);
                setConfirm(null);
              }}
            >
              {request?.confirmLabel ?? "OK"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
