/**
 * Application shell: phase theming, navigation, global keyboard control,
 * session wiring, and the crash boundary.
 */

import { Component, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { EncounterState } from "@/domain/types";
import { EncounterProvider, useStore, useStoreApi } from "@/state/store";
import { useSession } from "@/persistence/useSession";
import { readBackup, exportEncounter, importEncounter, clearBackup } from "@/persistence/localBackup";
import { loadSoundPreference, setSoundEnabled, isSoundEnabled, playCue } from "@/fx/sound";
import { Atmosphere } from "@/fx/atmosphere";
import { FeedbackProvider } from "@/fx/feedback";
import { TrackerTab } from "@/ui/tracker/TrackerTab";
import { LibraryTab } from "@/ui/library/LibraryTab";
import { GeneratorTab } from "@/ui/generator/GeneratorTab";
import { CommandPalette } from "@/ui/CommandPalette";
import { EventLog } from "@/ui/EventLog";
import { Button, ConfirmDialog, ToastProvider, useToast } from "@/ui/primitives";
import { announce, useHotkeys, usePrefersReducedMotion } from "@/ui/hooks";
import "@/ui/app.css";

type Tab = "tracker" | "library" | "generator";

const TABS: { id: Tab; label: string }[] = [
  { id: "tracker", label: "Tracker" },
  { id: "library", label: "Library" },
  { id: "generator", label: "Generator" },
];

/* ── Crash boundary ── */

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash" role="alert">
        <h1 className="crash__title display">The table cracked</h1>
        <p className="crash__body">
          Something failed while rendering. Your encounter is still mirrored locally and
          will be offered back when you reload.
        </p>
        <pre className="crash__detail">{this.state.error.message}</pre>
        <Button tone="phase" onClick={() => window.location.reload()}>
          Reload
        </Button>
      </div>
    );
  }
}

/* ── Shell ── */

function Shell() {
  const { present, revision } = useStore();
  const { dispatch, undo, redo } = useStoreApi();
  const toast = useToast();
  const reduced = usePrefersReducedMotion();

  const [tab, setTab] = useState<Tab>("tracker");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const [sound, setSound] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  /**
   * Read synchronously during the first render. The session hook mirrors state
   * to the same key on mount, so a deferred read would only ever see the empty
   * encounter this tab just wrote over the snapshot.
   */
  const [recovery, setRecovery] = useState<ReturnType<typeof readBackup>>(() => {
    const backup = readBackup();
    return backup && backup.state.combatants.length ? backup : null;
  });

  const onLoaded = useCallback(
    (state: EncounterState) => dispatch({ type: "ENCOUNTER_LOADED", state }),
    [dispatch],
  );

  const session = useSession(present, revision, onLoaded);

  useEffect(() => {
    setSound(loadSoundPreference());
  }, []);

  useHotkeys(
    useMemo(
      () => [
        { combo: "mod+k", handler: () => setPaletteOpen(true), allowInInput: true },
        { combo: "mod+z", handler: undo, allowInInput: false },
        { combo: "mod+shift+z", handler: redo, allowInInput: false },
        { combo: "mod+y", handler: redo, allowInInput: false },
        {
          combo: " ",
          handler: () => {
            dispatch({ type: "PHASE_ADVANCED" });
            playCue("phase");
          },
        },
        { combo: "1", handler: () => setTab("tracker") },
        { combo: "2", handler: () => setTab("library") },
        { combo: "3", handler: () => setTab("generator") },
        { combo: "l", handler: () => setLogOpen((v) => !v) },
        { combo: "?", handler: () => setPaletteOpen(true) },
      ],
      [dispatch, undo, redo],
    ),
  );

  const doExport = () => {
    const blob = new Blob([exportEncounter(present)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hei-mao-encounter-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.push("Encounter exported", "ok");
  };

  const doImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const state = importEncounter(await file.text());
        dispatch({ type: "ENCOUNTER_LOADED", state });
        toast.push(`Imported ${state.combatants.length} combatants`, "ok");
      } catch {
        toast.push("That file could not be read as an encounter", "danger");
      }
    };
    input.click();
  };

  return (
    <div className="app" data-phase={present.phase} data-motion={reduced ? "reduced" : undefined}>
      <Atmosphere phase={present.phase} />

      <a className="skip-link" href="#main">
        Skip to the tracker
      </a>

      <header className="topbar">
        <div className="topbar__inner">
          <div className="brand">
            <span className="brand__seal" aria-hidden="true">
              黑
            </span>
            <span className="brand__name display">Hei Mao</span>
          </div>

          <nav className="tabs" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className="tab"
                data-active={tab === t.id ? "1" : undefined}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="topbar__tools">
            <button
              type="button"
              className="tool"
              onClick={() => setPaletteOpen(true)}
              aria-label="Open command palette"
              title="Command palette (Ctrl/Cmd + K)"
            >
              ⌘K
            </button>
            <button
              type="button"
              className="tool"
              aria-pressed={logOpen}
              onClick={() => setLogOpen((v) => !v)}
              title="Combat log (L)"
            >
              Log
            </button>
            <button
              type="button"
              className="tool"
              aria-pressed={sound}
              onClick={() => setSound(setSoundEnabled(!isSoundEnabled()))}
              title={sound ? "Mute sound" : "Enable sound"}
            >
              {sound ? "🔊" : "🔇"}
            </button>
          </div>
        </div>
      </header>

      {recovery && (
        <div className="recovery" role="status">
          <span>
            An unsaved encounter with {recovery.state.combatants.length} combatants was
            found from {new Date(recovery.savedAt).toLocaleString()}.
          </span>
          <div className="recovery__actions">
            <Button
              size="sm"
              tone="phase"
              onClick={() => {
                dispatch({ type: "ENCOUNTER_LOADED", state: recovery.state });
                setRecovery(null);
                announce("Recovered encounter restored.");
              }}
            >
              Restore it
            </Button>
            <Button
              size="sm"
              onClick={() => {
                clearBackup();
                setRecovery(null);
              }}
            >
              Discard
            </Button>
          </div>
        </div>
      )}

      <main className="main" id="main">
        <div className="main__inner">
          {tab === "tracker" && <TrackerTab session={session} />}
          {tab === "library" && <LibraryTab onAdded={() => setTab("tracker")} />}
          {tab === "generator" && <GeneratorTab onAdded={() => setTab("tracker")} />}
        </div>
      </main>

      <EventLog open={logOpen} onClose={() => setLogOpen(false)} />

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        onGo={setTab}
        onExport={doExport}
        onImport={doImport}
        onClear={() => setConfirmClear(true)}
        onToggleLog={() => setLogOpen((v) => !v)}
      />

      <ConfirmDialog
        open={confirmClear}
        onClose={() => setConfirmClear(false)}
        onConfirm={() => {
          dispatch({ type: "ENCOUNTER_CLEARED" });
          announce("Encounter cleared.");
          toast.push("Encounter cleared — undo is available", "warn");
        }}
        title="Clear the encounter?"
        confirmLabel="Clear everything"
        body={
          <>
            This removes <strong>all {present.combatants.length} combatants</strong> and
            resets the round counter. Your session record is not deleted, and this can be
            undone with Ctrl/Cmd + Z.
          </>
        }
      />
    </div>
  );
}

export function App() {
  return (
    <Boundary>
      <EncounterProvider>
        <ToastProvider>
          <FeedbackProvider>
            <Shell />
          </FeedbackProvider>
        </ToastProvider>
      </EncounterProvider>
    </Boundary>
  );
}
