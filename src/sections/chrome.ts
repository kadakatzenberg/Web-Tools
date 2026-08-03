import { glyphMarkup } from '../content/glyphs';
import { cta } from '../ui';
import { soundscape } from '../core/audio';
import { viewport } from '../core/scroll';
import { ticker } from '../core/ticker';

export function mastheadMarkup(): string {
  return `
  <header class="masthead" id="masthead">
    <a class="mark" href="#top" aria-label="Joey Yap's China Excursion 2026, back to top">
      ${glyphMarkup('dragon', { className: 'mark__glyph' })}
      <span class="mark__text">
        <span>Joey Yap</span>
        <span>China Excursion 2026</span>
      </span>
    </a>
    <div class="masthead__tools">
      <button
        class="icon-button"
        id="sound-toggle"
        type="button"
        aria-pressed="false"
        aria-describedby="sound-hint"
      >
        <span class="sound-bars" aria-hidden="true"><i></i><i></i><i></i><i></i></span>
        <span id="sound-toggle-label">Sound off</span>
      </button>
      <span class="visually-hidden" id="sound-hint">
        Optional ambient sound. The page carries no essential information through audio.
      </span>
      ${cta({ label: 'Speak With The Journey Team' })}
    </div>
  </header>`;
}

export function dockMarkup(): string {
  return `
  <aside class="dock" id="dock" aria-label="Reserve your place">
    <p class="dock__meta">
      <strong>10 to 15 September 2026</strong>
      <span>Reservations now open</span>
    </p>
    ${cta({ label: 'Speak With The Team' })}
  </aside>`;
}

export function initChrome(): void {
  const masthead = document.getElementById('masthead');
  const dock = document.getElementById('dock');
  const hero = document.getElementById('hero');
  const final = document.getElementById('final');

  window.setTimeout(() => masthead?.classList.add('is-visible'), 420);

  ticker.add(() => {
    const condensed = viewport.scrollY > viewport.height * 0.35;
    masthead?.classList.toggle('is-condensed', condensed);
  });

  if (hero && dock) {
    // The dock appears once the hero has been read, and steps aside wherever
    // the page already carries a full call to action of its own.
    const resolution = document.getElementById('resolution');
    const yields = [final, resolution].filter(Boolean) as HTMLElement[];
    const active = new Set<Element>();
    let pastHero = false;

    const sync = () => {
      dock.classList.toggle('is-visible', pastHero && active.size === 0);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === hero) {
            pastHero = !entry.isIntersecting;
            continue;
          }
          if (entry.isIntersecting) active.add(entry.target);
          else active.delete(entry.target);
        }
        sync();
      },
      { rootMargin: '-30% 0px 0px 0px' },
    );
    io.observe(hero);
    yields.forEach((el) => io.observe(el));
  }

  const toggle = document.getElementById('sound-toggle');
  const label = document.getElementById('sound-toggle-label');
  if (toggle && soundscape.available) {
    toggle.addEventListener('click', async () => {
      if (soundscape.enabled) {
        soundscape.disable();
        toggle.setAttribute('aria-pressed', 'false');
        if (label) label.textContent = 'Sound off';
      } else {
        await soundscape.enable();
        toggle.setAttribute('aria-pressed', 'true');
        if (label) label.textContent = 'Sound on';
      }
    });
  } else if (toggle) {
    toggle.remove();
  }
}
