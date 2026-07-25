/**
 * Shared UI primitives. Every control here is keyboard-operable, has a visible
 * focus ring, and meets the 44px touch target on coarse pointers.
 */

import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useFocusTrap, useId, useScrollLock } from "./hooks";
import "./primitives.css";

/* ── Button ── */

type Tone = "neutral" | "phase" | "danger" | "heal" | "shield" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: Tone;
  size?: "sm" | "md";
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { tone = "neutral", size = "md", block, className = "", ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--${tone} btn--${size} ${block ? "btn--block" : ""} ${className}`}
      {...rest}
    />
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  tone?: Tone;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton({ label, tone = "ghost", className = "", children, ...rest }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={`icon-btn icon-btn--${tone} ${className}`}
        {...rest}
      >
        {children}
      </button>
    );
  },
);

/* ── Field ── */

export function Field({
  label,
  children,
  hint,
  error,
  inline,
}: {
  label: string;
  children: (id: string) => ReactNode;
  hint?: string;
  error?: string;
  inline?: boolean;
}) {
  const id = useId("f");
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${inline ? "field--inline" : ""}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      <div className="field__control" data-described={describedBy}>
        {children(id)}
      </div>
      {hint && !error && (
        <p className="field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="field__error" id={`${id}-err`} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/* ── Number input ── */

/**
 * A signed integer field.
 *
 * A controlled `<input type="number">` cannot accept a negative number typed by
 * hand: the browser reports an intermediate "-" as an empty string, the parse
 * yields NaN, the value snaps back to 0, and the minus is lost. Typing "-3"
 * produced "03". Every enemy in this game is required to have a negative stat,
 * so that was not a small problem.
 *
 * This keeps the raw text locally and only reports a number, so "-" is a legal
 * intermediate state. `inputMode="numeric"` still summons a numeric keypad.
 */
export function NumberInput({
  value,
  onChange,
  className = "",
  ...rest
}: {
  value: number;
  onChange: (n: number) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type">) {
  const [text, setText] = useState(() => String(value));

  // Re-sync when the value changes from outside (a reset, a different combatant)
  // but never while the local text already represents it.
  useEffect(() => {
    const parsed = text === "" || text === "-" ? 0 : Number.parseInt(text, 10);
    if (parsed !== value) setText(String(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <input
      {...rest}
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
      onFocus={(e) => {
        // These fields nearly always get replaced rather than edited, and a
        // field already showing "0" otherwise puts the caret after it — so
        // typing "-3" produced "03".
        e.target.select();
        rest.onFocus?.(e);
      }}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^-?\d*$/.test(raw)) return; // reject anything not a signed integer
        setText(raw);
        onChange(raw === "" || raw === "-" ? 0 : Number.parseInt(raw, 10));
      }}
    />
  );
}

/* ── Badge ── */

export function Badge({
  children,
  tone = "neutral",
  glyph,
}: {
  children: ReactNode;
  tone?: "neutral" | "player" | "enemy" | "warn" | "danger" | "ok" | "info";
  /** Rendered before the label so state never depends on colour alone. */
  glyph?: string;
}) {
  return (
    <span className={`badge badge--${tone}`}>
      {glyph && (
        <span className="badge__glyph" aria-hidden="true">
          {glyph}
        </span>
      )}
      {children}
    </span>
  );
}

/* ── Meter ── */

export function Meter({
  value,
  max,
  tone,
  label,
  compact,
}: {
  value: number;
  max: number;
  tone: string;
  label: string;
  compact?: boolean;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  return (
    <div
      className={`meter ${compact ? "meter--compact" : ""}`}
      role="meter"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-label={label}
    >
      <div className="meter__fill" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

/* ── Modal ── */

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = 560,
  labelledBy,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  labelledBy?: string;
}) {
  const ref = useFocusTrap(open, onClose);
  useScrollLock(open);
  const titleId = useId("modal-title");
  if (!open) return null;

  return createPortal(
    <div
      className="modal-scrim"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy ?? titleId}
        style={{ maxWidth: width }}
        ref={ref}
        tabIndex={-1}
      >
        <header className="modal__head">
          <h2 className="modal__title display" id={titleId}>
            {title}
          </h2>
          <IconButton label="Close dialog" onClick={onClose}>
            ✕
          </IconButton>
        </header>
        <div className="modal__body">{children}</div>
        {footer && <footer className="modal__foot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

/* ── Confirm ── */

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: Tone;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button
            tone={tone}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="confirm__body">{body}</div>
    </Modal>
  );
}

/* ── Toasts ── */

export interface Toast {
  id: number;
  text: string;
  tone: "ok" | "warn" | "danger" | "info";
  action?: { label: string; run: () => void };
}

interface ToastApi {
  push: (
    text: string,
    tone?: Toast["tone"],
    action?: { label: string; run: () => void },
  ) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

let toastSeq = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const push = useCallback<ToastApi["push"]>((text, tone = "info", action) => {
    const id = ++toastSeq;
    setToasts((t) => [...t, { id, text, tone, action }].slice(-4));
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), action ? 8000 : 4000);
  }, []);

  const api = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {createPortal(
        <div className="toasts" role="region" aria-label="Notifications">
          {toasts.map((t) => (
            <div key={t.id} className={`toast toast--${t.tone}`}>
              <span className="toast__text">{t.text}</span>
              {t.action && (
                <button
                  type="button"
                  className="toast__action"
                  onClick={() => {
                    t.action!.run();
                    setToasts((list) => list.filter((x) => x.id !== t.id));
                  }}
                >
                  {t.action.label}
                </button>
              )}
              <button
                type="button"
                className="toast__close"
                aria-label="Dismiss notification"
                onClick={() => setToasts((list) => list.filter((x) => x.id !== t.id))}
              >
                ✕
              </button>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error("useToast must be used inside <ToastProvider>");
  return v;
}

/* ── Disclosure ── */

export function Disclosure({
  label,
  children,
  defaultOpen = false,
  tone,
  count,
}: {
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  tone?: string;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId("disc");
  return (
    <div className="disclosure">
      <button
        type="button"
        className="disclosure__trigger"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        style={tone ? { color: tone } : undefined}
      >
        <span className="disclosure__caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span>{label}</span>
        {count != null && <span className="disclosure__count tnum">({count})</span>}
      </button>
      {open && (
        <div className="disclosure__panel" id={id}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ── Empty state ── */

export function EmptyState({
  title,
  body,
  action,
  seal = "無",
}: {
  title: string;
  body: string;
  action?: ReactNode;
  seal?: string;
}) {
  return (
    <div className="empty">
      <div className="empty__seal" aria-hidden="true">
        {seal}
      </div>
      <h3 className="empty__title display">{title}</h3>
      <p className="empty__body">{body}</p>
      {action && <div className="empty__action">{action}</div>}
    </div>
  );
}

/* ── Error boundary fallback ── */

export function ErrorPanel({ error, onRetry }: { error: string; onRetry?: () => void }) {
  return (
    <div className="error-panel" role="alert">
      <div className="error-panel__mark" aria-hidden="true">
        ⚠
      </div>
      <div>
        <p className="error-panel__title">Something went wrong</p>
        <p className="error-panel__detail">{error}</p>
      </div>
      {onRetry && (
        <Button tone="neutral" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

/* ── Autofocus helper ── */

export function useAutoFocus(active: boolean) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useEffect(() => {
    if (active && node) node.focus({ preventScroll: true });
  }, [active, node]);
  return setNode;
}
