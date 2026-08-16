import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import WordLeafApp from "./app/WordLeafApp";
import "./app/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <WordLeafApp />
  </StrictMode>,
);
