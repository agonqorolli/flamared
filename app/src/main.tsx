import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applySavedAppearance } from "./lib/settings";
import { applySavedWidths } from "./lib/panes";
import { initStore } from "./lib/store";
import { loadLicense } from "./lib/license";

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
