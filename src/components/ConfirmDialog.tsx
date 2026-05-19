type Props = {
  message: string;
  onYes: () => void;
  onNo: () => void;
};

export function ConfirmDialog({ message, onYes, onNo }: Props) {
  return (
    <div className="dialog-backdrop" role="dialog" aria-modal="true">
      <div className="dialog">
        <p>{message}</p>
        <div className="dialog-actions">
          <button type="button" onClick={onYes}>
            Yes
          </button>
          <button type="button" onClick={onNo}>
            No
          </button>
        </div>
      </div>
    </div>
  );
}
