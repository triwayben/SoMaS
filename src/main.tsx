import { createRoot } from "react-dom/client";
import App from "./App";
import { watchForUpdates } from "./lib/updates";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root container missing");

createRoot(container).render(<App />);

// A home-screen app can sit on an old build for days; pick up a new one on wake.
watchForUpdates();
