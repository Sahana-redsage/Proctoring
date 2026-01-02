import { useState } from "react";
import Candidate from "./pages/Candidate";
import Admin from "./pages/Admin";

export default function App() {
    const [view, setView] = useState("candidate");

    return (
        <div style={{ padding: 20 }}>
            <button onClick={() => setView("candidate")}>Candidate</button>
            <button onClick={() => setView("admin")}>Admin</button>
            <hr />
            {view === "candidate" ? <Candidate /> : <Admin />}
        </div>
    );
}
