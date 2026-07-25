import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

// Latin subsets only — the app has no Cyrillic or mathematical content, and the
// full family would triple the font payload for glyphs that never render.
import "@fontsource/cinzel/latin-400.css";
import "@fontsource/cinzel/latin-600.css";
import "@fontsource/cinzel/latin-700.css";
import "@fontsource/noto-serif/latin-400.css";
import "@fontsource/noto-serif/latin-600.css";
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
