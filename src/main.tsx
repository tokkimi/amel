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
createRoot(document.getElementById("root")!).render(
  <>
    <Portal />
    <MobileSplash />
  </>,
);
