import "@kadr/ui/theme.css";
import "../styles.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { CountdownApp } from "./CountdownApp";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <CountdownApp />
  </StrictMode>,
);
