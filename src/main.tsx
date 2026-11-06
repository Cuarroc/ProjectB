import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./design/schriften.css";
import "./design/tokens.css";
import App from "./App";
import Vorschau2 from "./bausteine/Vorschau2";

createRoot(document.getElementById("root")!).render(
  <StrictMode>{new URLSearchParams(location.search).get("vorschau") === "bausteine2" ? <Vorschau2 /> : <App />}</StrictMode>,
);
