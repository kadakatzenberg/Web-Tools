import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

/**
 * Three faces, each with one job.
 *
 * Cinzel is carved Roman capital — it does ceremony: the round, the phase, the
 * seals. IBM Plex Sans is a systems typeface and carries every piece of
 * operational data, which is most of this interface; a serif is a poor face for
 * dense figures, so the old body serif is now used for prose only. Plex Mono
 * supplies tabular figures wherever numbers have to align in a column.
 *
 * Latin subsets only — there is no Cyrillic or Greek content here, and the full
 * families would multiply the payload for glyphs that never render. The two CJK
 * characters in the interface (the seals) come from the system stack.
 */
import "@fontsource/cinzel/latin-400.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource-variable/ibm-plex-sans/wght.css";
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-500.css";
import "@fontsource/noto-serif/latin-400.css";
import "@fontsource/noto-serif/latin-400-italic.css";

import "./styles/global.css";
import { App } from "./App";

const host = document.getElementById("root");
if (!host) throw new Error("Root element missing");

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
