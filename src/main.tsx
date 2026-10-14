import React from "react";
import { createRoot } from "react-dom/client";
import Portal from "./Portal";
import { MobileSplash } from "./Experience";
import "./style.css";
import "./public.css";
import "./connected.css";
import "./admin.css";
import "./experience.css";
import "./pro-suite.css";
import "./brand-glass.css";
import "./stability.css";
import "./smilepec-home.css";
createRoot(document.getElementById("root")!).render(
  <>
    <Portal />
    <MobileSplash />
  </>,
);

// Écran de chargement (index.html) : laisse l'animation du logo se terminer, puis s'efface.
const bootSplash = document.getElementById("boot-splash");
if (bootSplash) {
  const minVisible = 1300 - performance.now();
  setTimeout(() => {
    bootSplash.classList.add("is-done");
    setTimeout(() => bootSplash.remove(), 600);
  }, Math.max(minVisible, 250));
}
