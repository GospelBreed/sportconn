import { useEffect, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./Icon";
import { Button } from "./primitives";

function useEscape(onClose: () => void) {
  useEffect(() => {
    const fn = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [onClose]);
}

function useBodyLock(open: boolean) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);
}

// ---------------- Modal ----------------
export function Modal({
  open,
  onClose,
  title,
  children,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}) {
  useEscape(onClose);
  useBodyLock(open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:p-6">
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "card-base relative z-10 my-8 w-full animate-scale-in shadow-pop",
          width,
        )}
      >
        {title && (
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="text-base font-semibold text-ink">{title}</h2>
            <button
              onClick={onClose}
              className="rounded-control p-1 text-muted hover:bg-line/60 hover:text-ink"
              aria-label="Close"
            >
              <Icon name="close" size={18} />
            </button>
          </div>
        )}
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ---------------- SlideOver ----------------
export function SlideOver({
  open,
  onClose,
  children,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  width?: string;
}) {
  useEscape(onClose);
  useBodyLock(open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-[2px] animate-fade-in" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cn(
          "absolute right-0 top-0 h-full w-full overflow-y-auto border-l border-line bg-surface shadow-pop animate-slide-in",
          width,
        )}
      >
        {children}
      </div>
    </div>
  );
}

// ---------------- ConfirmDialog ----------------
export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Delete",
  tone = "danger",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  loading?: boolean;
}) {
  return (
    <Modal open={open} onClose={onClose} width="max-w-sm">
      <div className="space-y-4">
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-card",
            tone === "danger" ? "bg-danger/10 text-danger" : "bg-primary/10 text-primary",
          )}
        >
          <Icon name={tone === "danger" ? "trash" : "check"} size={20} />
        </div>
        <div className="space-y-1">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          <p className="text-sm text-muted">{message}</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ---------------- Tabs ----------------
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: T; label: string; count?: number }[];
  active: T;
  onChange: (t: T) => void;
}) {
  return (
    <div className="flex gap-1 border-b border-line">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "relative px-3 py-2.5 text-sm font-medium transition-colors",
            active === t.key ? "text-ink" : "text-muted hover:text-ink",
          )}
        >
          {t.label}
          {typeof t.count === "number" && (
            <span className="ml-1.5 rounded-control bg-line px-1.5 py-0.5 text-[10px] font-semibold text-muted">
              {t.count}
            </span>
          )}
          {active === t.key && (
            <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
          )}
        </button>
      ))}
    </div>
  );
}

// ---------------- Menu ----------------
export function Menu({
  open,
  onClose,
  children,
  align = "right",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  align?: "left" | "right";
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-20" onClick={onClose} />
      <div
        className={cn(
          "absolute z-30 mt-1 min-w-[168px] overflow-hidden rounded-control border border-line bg-surface py-1 shadow-pop animate-scale-in",
          align === "right" ? "right-0" : "left-0",
        )}
      >
        {children}
      </div>
    </>
  );
}

export function MenuItem({
  children,
  onClick,
  danger,
  icon,
}: {
  children: ReactNode;
  onClick: () => void;
  danger?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-line/60",
        danger ? "text-danger" : "text-body",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
