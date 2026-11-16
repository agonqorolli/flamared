import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { applySavedAppearance } from "./lib/settings";
import { initStore } from "./lib/store";

// Saved state first (settings, review marks...), then the theme, then the window.
initStore().then(() => {
  applySavedAppearance();
  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
});
