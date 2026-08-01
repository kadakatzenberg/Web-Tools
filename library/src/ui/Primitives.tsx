import {
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import { sigilFor } from '@/domain/sigil';
import { portraitAt } from '@/data/client';

/* ── Sigil ───────────────────────────────────────────────────────────────── */

interface SigilProps {
  id: string;
  /** Era colour, so a soul's mark carries its world's pigment. */
  tint?: string;
  className?: string;
}

/**
 * The seal drawn for an entry with no portrait. Geometry only — no text, no
 * image, no request — and the same id always draws the same mark.
 */
export function Sigil({ id, tint, className }: SigilProps) {
  const sigil = useMemo(() => sigilFor(id), [id]);
  const colour = tint || `oklch(0.62 0.09 ${sigil.hue})`;

  return (
    <svg
      className={className ? `sigil ${className}` : 'sigil'}
      viewBox="0 0 100 100"
      role="presentation"
      aria-hidden="true"
      style={{ '--sigil-tint': colour } as React.CSSProperties}
    >
      {sigil.shapes.map((shape, index) =>
        shape.kind === 'circle' ? (
          <circle
            key={index}
            cx={shape.cx}
            cy={shape.cy}
            r={shape.r}
            fill={shape.fill ? 'currentColor' : 'none'}
            stroke={shape.fill ? 'none' : 'currentColor'}
            strokeWidth={shape.stroke || undefined}
            strokeDasharray={shape.dash}
            opacity={shape.alpha}
          />
        ) : (
          <path
            key={index}
            d={shape.d}
            fill={shape.fill ? 'currentColor' : 'none'}
            stroke={shape.fill ? 'none' : 'currentColor'}
            strokeWidth={shape.stroke || undefined}
            strokeLinejoin="round"
            strokeDasharray={shape.dash}
            opacity={shape.alpha}
          />
        ),
      )}
    </svg>
  );
}

/* ── Portrait ────────────────────────────────────────────────────────────── */

interface PortraitProps {
  entryId: string;
  src: string;
  alt: string;
  /** CSS width the image will occupy, used to size the request. */
  width: number;
  tint?: string;
  className?: string;
  /** The first screenful should not be lazy; it is the LCP element. */
  eager?: boolean;
  viewTransitionName?: string;
}

/**
 * A portrait, or the entry's sigil when there is none, or the sigil again if
 * the portrait fails to load.
 *
 * v1 rendered a broken-image icon in that last case — Supabase objects do
 * disappear, and a wall of broken images is what the grid looked like the day
 * one upload went missing.
 */
export function Portrait({
  entryId,
  src,
  alt,
  width,
  tint,
  className,
  eager,
  viewTransitionName,
}: PortraitProps) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const sized = useMemo(() => (src ? portraitAt(src, width) : ''), [src, width]);

  useEffect(() => {
    setFailed(false);
    setLoaded(false);
  }, [src]);

  const style = viewTransitionName
    ? ({ viewTransitionName } as React.CSSProperties)
    : undefined;

  if (!src || failed) {
    return (
      <div
        className={className ? `portrait portrait--sigil ${className}` : 'portrait portrait--sigil'}
        style={style}
      >
        <Sigil id={entryId} tint={tint} />
      </div>
    );
  }

  return (
    <div
      className={className ? `portrait ${className}` : 'portrait'}
      data-loaded={loaded || undefined}
      style={style}
    >
      {/* The sigil sits underneath as the placeholder, so nothing pops in
          against an empty box and the layout never shifts. */}
      <Sigil id={entryId} tint={tint} className="portrait__under" />
      <img
        src={sized}
        alt={alt}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        fetchPriority={eager ? 'high' : 'auto'}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

/* ── Dialog ──────────────────────────────────────────────────────────────── */

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Warn before discarding, for forms with unsaved work. */
  confirmClose?: () => boolean;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * The native element, driven by `showModal()`.
 *
 * The browser then owns the focus trap, the Escape key, the backdrop, the
 * inertness of everything behind it, and the correct role — all of which v1
 * hand-rolled with `classList.add("open")` on a div and got wrong in every
 * particular. Tab escaped its editor into the page behind, Escape did
 * nothing, and a screen reader was never told the dialog had opened.
 *
 * What is still ours: returning focus to whatever opened it, which the spec
 * only guarantees for the element that had focus at `showModal()` time.
 */
export function Dialog({
  open,
  onClose,
  title,
  confirmClose,
  children,
  footer,
  wide,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const opener = useRef<Element | null>(null);
  const headingId = useId();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    if (open && !node.open) {
      opener.current = document.activeElement;
      node.showModal();
      // Scrolling the page behind an open dialog is disorienting.
      document.body.style.overflow = 'hidden';
    } else if (!open && node.open) {
      node.close();
    }
  }, [open]);

  useEffect(() => {
    if (open) return;
    document.body.style.overflow = '';
    const previous = opener.current;
    if (previous instanceof HTMLElement && document.contains(previous)) {
      previous.focus({ preventScroll: true });
    }
  }, [open]);

  useEffect(
    () => () => {
      document.body.style.overflow = '';
    },
    [],
  );

  const requestClose = () => {
    if (confirmClose && !confirmClose()) return;
    onClose();
  };

  return (
    <dialog
      ref={ref}
      className={wide ? 'dialog dialog--wide' : 'dialog'}
      aria-labelledby={headingId}
      onCancel={(event) => {
        // Escape. Intercept so an unsaved form can object.
        event.preventDefault();
        requestClose();
      }}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === ref.current) requestClose();
      }}
    >
      <div className="dialog__panel">
        <header className="dialog__head">
          <h2 className="seal" id={headingId}>
            {title}
          </h2>
          <button
            type="button"
            className="icon-button"
            onClick={requestClose}
            aria-label={`Close ${title}`}
          >
            <Glyph name="close" />
          </button>
        </header>
        <div className="dialog__body">{children}</div>
        {footer ? <footer className="dialog__foot">{footer}</footer> : null}
      </div>
    </dialog>
  );
}

/* ── Glyphs ──────────────────────────────────────────────────────────────── */

const PATHS: Record<string, string> = {
  close: 'M4 4l12 12M16 4L4 16',
  search: 'M9 15.5a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13ZM13.8 13.8 18 18',
  back: 'M11.5 4.5 5 10l6.5 5.5M5.4 10H17',
  edit: 'M13.4 3.6a1.7 1.7 0 0 1 2.4 2.4L7.2 14.6l-3.2.8.8-3.2Z',
  trash: 'M4 6h12M8 6V4h4v2m-6 0v10h8V6M8.5 9v4M11.5 9v4',
  link: 'M8.5 11.5a3 3 0 0 0 4.2 0l2.6-2.6a3 3 0 0 0-4.2-4.2L9.8 5.9M11.5 8.5a3 3 0 0 0-4.2 0l-2.6 2.6a3 3 0 0 0 4.2 4.2l1.3-1.3',
  copy: 'M6.5 6.5V4.2h9.3v9.3h-2.3M4.2 6.5h9.3v9.3H4.2Z',
  star: 'M10 2.6l2.1 5 5.3.4-4 3.5 1.2 5.2L10 14l-4.6 2.7 1.2-5.2-4-3.5 5.3-.4Z',
  filter: 'M3 5h14M6 10h8M8.5 15h3',
  sun: 'M10 6.2a3.8 3.8 0 1 0 0 7.6 3.8 3.8 0 0 0 0-7.6ZM10 1.6v2M10 16.4v2M18.4 10h-2M3.6 10h-2M15.9 4.1l-1.4 1.4M5.5 14.5l-1.4 1.4M15.9 15.9l-1.4-1.4M5.5 5.5 4.1 4.1',
  moon: 'M16 11.7A6.6 6.6 0 0 1 8.3 4a6.9 6.9 0 1 0 7.7 7.7Z',
  chevron: 'M7.5 4.5 13 10l-5.5 5.5',
  plus: 'M10 4v12M4 10h12',
  external: 'M11 4h5v5M16 4l-7 7M14 11.5V16H4V6h4.5',
  note: 'M5 3h10v14l-5-3-5 3Z',
};

export function Glyph({ name, className }: { name: keyof typeof PATHS | string; className?: string }) {
  const d = PATHS[name] ?? PATHS.star!;
  return (
    <svg
      className={className ? `glyph ${className}` : 'glyph'}
      viewBox="0 0 20 20"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ── Toast ───────────────────────────────────────────────────────────────── */

export interface Notice {
  id: number;
  message: string;
  tone: 'plain' | 'good' | 'bad';
}

export function Toasts({ notices, onDismiss }: { notices: Notice[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts no-print">
      {notices.map((notice) => (
        <Toast key={notice.id} notice={notice} onDismiss={() => onDismiss(notice.id)} />
      ))}
    </div>
  );
}

function Toast({ notice, onDismiss }: { notice: Notice; onDismiss: () => void }) {
  useEffect(() => {
    // Failures stay until dismissed; there is usually something to read.
    if (notice.tone === 'bad') return;
    const timer = setTimeout(onDismiss, 4200);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);

  return (
    <div className="toast" data-tone={notice.tone}>
      <span>{notice.message}</span>
      <button type="button" className="icon-button icon-button--tight" onClick={onDismiss} aria-label="Dismiss">
        <Glyph name="close" />
      </button>
    </div>
  );
}

/* ── Empty and failure states ────────────────────────────────────────────── */

export function Placeholder({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="placeholder">
      <div className="placeholder__mark" aria-hidden="true">
        <Glyph name="note" />
      </div>
      <h2 className="placeholder__title display">{title}</h2>
      <p className="placeholder__body">{body}</p>
      {action}
    </div>
  );
}

/** A card-shaped skeleton, so the grid does not jump when entries land. */
export function GridSkeleton({ count = 12 }: { count?: number }) {
  return (
    <ul className="card-grid" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <li key={index} className="card card--ghost">
          <div className="card__portrait" />
          <div className="card__body">
            <span className="ghost-line" style={{ width: `${58 + ((index * 13) % 34)}%` }} />
            <span className="ghost-line ghost-line--short" style={{ width: `${34 + ((index * 7) % 26)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
