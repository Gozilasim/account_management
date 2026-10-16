/*
Created at: 2026-05-11 01:17
Updated at: 2026-10-11 02:29
Description: React application entrypoint.
*/

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
// Loaded second so the shared component styles build on the base theme rules.
import "./components.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
