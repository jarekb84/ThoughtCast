import React from "react";
import ReactDOM from "react-dom/client";
import App from "./app/App";
import { ApiProvider } from "./api";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <ApiProvider>
      <App />
    </ApiProvider>
  </React.StrictMode>
);
