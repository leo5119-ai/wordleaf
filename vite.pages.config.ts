import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// A browser-only bundle for Cloudflare Pages Direct Upload. WordLeaf stores
// its learning state in IndexedDB, so it does not need a server at runtime.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "dist-pages",
    emptyOutDir: true,
  },
});
