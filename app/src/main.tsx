import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { loadLicense } from "./lib/license";
import { applySavedWidths } from "./lib/panes";
import { applySavedAppearance } from "./lib/settings";
import { initStore } from "./lib/store";
import "./index.css";

// Saved state (settings, review marks...) and the license first, then the theme and column widths, then the window.
Promise.all([initStore(), loadLicense()]).then(([, license]) => {
  applySavedAppearance();
  applySavedWidths();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App license={license} />
    </React.StrictMode>,
  );
});
