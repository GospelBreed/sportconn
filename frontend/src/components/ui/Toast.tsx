import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";

type ToastKind = "success" | "error" | "info";
interface ToastRow {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  toast: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const ToastContext = createContext<ToastApi | undefined>(undefined);
let counter = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRow[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, kind: ToastKind = "info") => {
      const id = ++counter;
      setToasts((t) => [...t, { id, kind, message }]);
      setTimeout(() => remove(id), 4000);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      toast,
      success: (m) => toast(m, "success"),
      error: (m) => toast(m, "error"),
      info: (m) => toast(m, "info"),
    }),
    [toast],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[100] flex w-[360px] max-w-[calc(100vw-2rem)] flex-col gap-2">
        {toasts.map((t) => (
          <ToastItem key={t.id} row={t} onClose={() => remove(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const KIND: Record<ToastKind, { icon: "check" | "alert" | "sparkle"; cls: string }> = {
  success: { icon: "check", cls: "text-success" },
  error: { icon: "alert", cls: "text-danger" },
  info: { icon: "sparkle", cls: "text-info" },
};

function ToastItem({ row, onClose }: { row: ToastRow; onClose: () => void }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setShow(true));
  }, []);
  const k = KIND[row.kind];
  return (
    <div
      role="status"
      className={cn(
        "card-base pointer-events-auto flex items-start gap-3 px-4 py-3 shadow-pop transition-all duration-200",
        show ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0",
      )}
    >
      <span className={cn("mt-0.5 shrink-0", k.cls)}>
        <Icon name={k.icon} size={17} />
      </span>
      <p className="flex-1 text-sm text-body">{row.message}</p>
      <button onClick={onClose} className="text-muted hover:text-ink" aria-label="Dismiss">
        <Icon name="close" size={15} />
      </button>
    </div>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
