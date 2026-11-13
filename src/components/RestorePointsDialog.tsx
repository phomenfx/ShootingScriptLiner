/*
 * Restore an earlier copy: the autosave restore points kept in this browser,
 * newest first, each with its project name and time.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import * as commands from "../commands";
import { clearRestorePoints, readRestorePoints } from "../io/autosave";
import { useSessionStore } from "../stores/sessionStore";

export function RestorePointsDialog() {
  const open = useSessionStore((s) => s.restorePointsOpen);
  const setOpen = useSessionStore((s) => s.setRestorePointsOpen);
  const [, refresh] = useState(0);
  const points = open ? readRestorePoints() : [];

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content className="dialog-card import-dialog" aria-describedby={undefined}>
          <Dialog.Title className="import-title">Restore an earlier copy</Dialog.Title>
          <div className="import-body">
            {points.length === 0 ? (
              <p className="export-note">No earlier copies yet. They are kept about every 5 minutes while you work.</p>
            ) : (
              <ul className="restore-list">
                {points.map((point) => (
                  <li key={point.savedAt}>
                    <span>
                      <strong>{point.name || "Untitled"}</strong>
                      <small>{new Date(point.savedAt).toLocaleString()}</small>
                    </span>
                    <button type="button" className="dialog-btn" onClick={() => void commands.restoreFromPoint(point)}>
                      Open
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="dialog-buttons">
            <button
              type="button"
              className="dialog-btn dialog-btn-left"
              disabled={points.length === 0}
              onClick={() => {
                clearRestorePoints();
                refresh((n) => n + 1);
              }}
            >
              Delete all copies
            </button>
            <button type="button" className="dialog-btn dialog-btn-primary" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
