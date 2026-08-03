/**
 * Entrance reveals. One observer for the whole page, staggering children by
 * their document order rather than by hand written delays.
 */
let observer: IntersectionObserver | null = null;

export function initReveals(reducedMotion: boolean): void {
  const targets = document.querySelectorAll<HTMLElement>('[data-reveal]');

  // Line reveals need an inner element to slide behind the mask.
  document.querySelectorAll<HTMLElement>('[data-reveal="line"]').forEach((el) => {
    if (el.firstElementChild?.classList.contains('reveal-inner')) return;
    const inner = document.createElement('span');
    inner.className = 'reveal-inner';
    while (el.firstChild) inner.append(el.firstChild);
    el.append(inner);
  });

  if (reducedMotion) {
    targets.forEach((el) => el.classList.add('is-revealed'));
    return;
  }

  observer =
    observer ??
    new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const el = entry.target as HTMLElement;
          el.classList.add('is-revealed');
          observer?.unobserve(el);
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.08 },
    );

  const groups = new Map<Element, number>();
  targets.forEach((el) => {
    const parent = el.parentElement ?? document.body;
    const index = groups.get(parent) ?? 0;
    groups.set(parent, index + 1);
    if (!el.style.getPropertyValue('--reveal-delay')) {
      el.style.setProperty('--reveal-delay', `${Math.min(index, 4) * 70}ms`);
    }
    observer?.observe(el);
  });
}

/** Runs a callback the first time an element is on screen. */
export function onFirstView(el: Element, fn: () => void, rootMargin = '200px'): void {
  const io = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        io.disconnect();
        fn();
      }
    },
    { rootMargin },
  );
  io.observe(el);
}

/** Tracks whether an element is anywhere near the viewport. */
export function trackVisibility(
  el: Element,
  onChange: (visible: boolean) => void,
  rootMargin = '10%',
): () => void {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) onChange(entry.isIntersecting);
    },
    { rootMargin },
  );
  io.observe(el);
  return () => io.disconnect();
}
