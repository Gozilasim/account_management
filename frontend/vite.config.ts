/*
Created at: 2026-05-11 01:17
Updated at: 2026-05-11 01:27
Description: Vite configuration for the React Portal frontend.
*/

// ###############################################
// Imports
// ###############################################

import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

// ###############################################
// Helpers
// ###############################################

function parsePort(value: string | undefined, fallback: number) {
  const port = Number(value);
  if (Number.isInteger(port) && port > 0 && port < 65536) {
    return port;
  }
  return fallback;
}

// ###############################################
// Vite Config
// ###############################################

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const port = parsePort(env.FRONTEND_PORT ?? env.VITE_FRONTEND_PORT, 5173);

  return {
    plugins: [react()],
    server: {
      host: env.FRONTEND_HOST ?? "127.0.0.1",
      port,
      strictPort: env.FRONTEND_STRICT_PORT !== "false"
    }
  };
});
