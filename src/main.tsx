import React from "react";
import ReactDOM from "react-dom/client";
import { CloudRoot } from "./auth/CloudRoot";
import { ModalHost } from "./lib/modals";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CloudRoot />
    <ModalHost />
  </React.StrictMode>
);
