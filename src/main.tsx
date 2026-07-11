import React from "react";
import ReactDOM from "react-dom/client";
import { CloudRoot } from "./auth/CloudRoot";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <CloudRoot />
  </React.StrictMode>
);
