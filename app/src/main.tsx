import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applySavedAppearance } from "./lib/settings";
import { initStore } from "./lib/store";
import { loadLicense } from "./lib/license";

// Saved state (settings, review marks...) and the license first, then the theme, then the window.
Promise.all([initStore(), loadLicense()]).then(([, license]) => {
  applySavedAppearance();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App license={license} />
    </React.StrictMode>,
  );
});
