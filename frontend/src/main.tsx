/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-11 01:17
Description: React application entrypoint.
*/

import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
