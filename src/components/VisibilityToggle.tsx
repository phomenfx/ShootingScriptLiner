type Props = {
  visible: boolean;
  onToggle: () => void;
  label: string;
};

export function VisibilityToggle({ visible, onToggle, label }: Props) {
  return (
    <button
      type="button"
      className={`eye-btn ${visible ? "eye-on" : "eye-off"}`}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      title={visible ? `Hide ${label}` : `Show ${label}`}
      aria-label={visible ? `Hide ${label}` : `Show ${label}`}
    >
      {visible ? "👁" : "👁‍🗨"}
    </button>
  );
}
