import { defaultState, type SceneState } from '../gl/stage';
import { lerp, lerpVec3, smootherstep, type Vec3 } from '../gl/math';
import { viewport } from './scroll';
import { pointer } from './pointer';

export interface Beat {
  /** Element the beat is anchored to. */
  id: string;
  /** Where inside that element the beat sits, 0 top edge, 1 bottom edge. */
  at: number;
  state: Partial<SceneState>;
}

type Modifier = (state: SceneState) => void;

interface ResolvedBeat extends Beat {
  y: number;
  state: SceneState;
}

const NUMERIC_KEYS = [
  'fov',
  'mood',
  'vein',
  'meridian',
  'rings',
  'embrace',
  'waterLevel',
  'waterFade',
  'mist',
  'fracture',
  'goldPath',
  'dawn',
  'celestial',
  'exposure',
  'bloom',
  'chroma',
  'grain',
  'vignette',
  'instability',
  'flash',
  'particles',
  'timeScale',
] as const;

/**
 * Turns the page's scroll position into a camera move. Beats are anchored to
 * real elements, so the landscape stays in step with the writing at any
 * viewport size without a single hard coded scroll offset.
 */
export class Narrative {
  private beats: ResolvedBeat[] = [];
  private modifiers: Modifier[] = [];
  private readonly output: SceneState = defaultState();
  private readonly posA: Vec3 = [0, 0, 0];
  private readonly posB: Vec3 = [0, 0, 0];

  constructor(private readonly definitions: Beat[]) {
    this.resolve();
  }

  addModifier(fn: Modifier): void {
    this.modifiers.push(fn);
  }

  /** Recomputes anchor positions. Called on resize and after fonts settle. */
  resolve(): void {
    let previous: SceneState = defaultState();
    this.beats = this.definitions.flatMap((beat) => {
      const el = document.getElementById(beat.id);
      if (!el) return [];
      const rect = el.getBoundingClientRect();
      const top = rect.top + window.scrollY;
      const state: SceneState = { ...previous, ...beat.state } as SceneState;
      if (beat.state.camPos) state.camPos = [...beat.state.camPos] as Vec3;
      if (beat.state.camTarget) state.camTarget = [...beat.state.camTarget] as Vec3;
      if (beat.state.flashColour) state.flashColour = [...beat.state.flashColour] as Vec3;
      previous = state;
      return [{ ...beat, y: top + rect.height * beat.at, state }];
    });
    this.beats.sort((a, b) => a.y - b.y);
  }

  update(): SceneState {
    const out = this.output;
    if (this.beats.length === 0) return out;

    const focus = viewport.scrollY + viewport.height * 0.5;
    let index = 0;
    while (index < this.beats.length - 1 && this.beats[index + 1]!.y <= focus) index++;

    const a = this.beats[index]!;
    const b = this.beats[Math.min(index + 1, this.beats.length - 1)]!;
    const span = b.y - a.y;
    const raw = span > 0 ? (focus - a.y) / span : 0;
    const t = smootherstep(raw);

    lerpVec3(a.state.camPos, b.state.camPos, t, this.posA);
    lerpVec3(a.state.camTarget, b.state.camTarget, t, this.posB);

    out.camPos[0] = this.posA[0];
    out.camPos[1] = this.posA[1];
    out.camPos[2] = this.posA[2];
    out.camTarget[0] = this.posB[0];
    out.camTarget[1] = this.posB[1];
    out.camTarget[2] = this.posB[2];

    for (const key of NUMERIC_KEYS) {
      out[key] = lerp(a.state[key], b.state[key], t);
    }
    lerpVec3(a.state.flashColour, b.state.flashColour, t, out.flashColour);

    for (const modifier of this.modifiers) modifier(out);

    // The pointer nudges the framing rather than steering it.
    const sway = 1 - Math.min(out.fracture, 1) * 0.6;
    out.camTarget[0] += pointer.ex * 3.6 * sway;
    out.camTarget[1] += -pointer.ey * 2.2 * sway;
    out.camPos[0] += pointer.ex * 1.1 * sway;
    out.camPos[1] += -pointer.ey * 0.8 * sway;

    return out;
  }
}
