import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // relative base — works both locally and on GitHub Pages regardless of repo name
  base: "./",
  plugins: [react()],
});
