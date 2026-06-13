import { useCallback, useEffect, useRef, useState } from "react";

interface Props {
  onUndo: () => void;
  onCommit: () => void;
}

export function UndoToast({ onUndo, onCommit }: Props) {
  const [leaving, setLeaving] = useState(false);
  const actedRef = useRef(false);

  const act = useCallback(
    (type: "undo" | "commit") => {
      if (actedRef.current) return;
      actedRef.current = true;
      setLeaving(true);
      setTimeout(() => {
        if (type === "undo") onUndo();
        else onCommit();
      }, 380);
    },
    [onUndo, onCommit],
  );

  useEffect(() => {
    const t = setTimeout(() => act("commit"), 5000);
    return () => clearTimeout(t);
  }, [act]);

  return (
    <div className={`undo-toast${leaving ? " leaving" : ""}`}>
      <div className="undo-toast-progress" />
      <div className="undo-toast-body">
        <span className="undo-toast-label">Note deleted</span>
        <button className="undo-toast-btn" onClick={() => act("undo")}>
          Undo
        </button>
      </div>
    </div>
  );
}
