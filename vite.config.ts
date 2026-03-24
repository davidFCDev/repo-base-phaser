import { remixPlugin } from "@insidethesim/remix-dev/vite";
import { defineConfig } from "vite";
import remixConfig from "./remix.config";

export default defineConfig({
  plugins: [remixPlugin(remixConfig)],
  define: {
    global: "window", // Polyfill de `global` para libs que lo esperan
  },
});
