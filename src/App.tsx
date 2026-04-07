import { BrowserRouter, Routes, Route } from "react-router-dom"
import Dashboard from "./editor/Dashboard"
import BlockEditor from "./editor/blockeditor"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Doc dashboard */}
        <Route path="/" element={<Dashboard />} />
        {/* For Link-Sharing */}
        <Route path="/doc/:docId" element={<BlockEditor />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
