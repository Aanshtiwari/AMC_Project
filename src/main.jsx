import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

const rootElement = document.getElementById("root");

try {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
} catch (error) {
  rootElement.innerHTML = `
    <main class="startup-error">
      <h1>The application could not start</h1>
      <p>${error.message}</p>
    </main>
  `;
  console.error(error);
}
