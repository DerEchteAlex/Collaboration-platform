import { BrowserRouter, Routes, Route } from "react-router-dom"
import Dashboard from "./editor/Dashboard"
import BlockEditor from "./editor/blockeditor"

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Document dashboard — list + create */}
        <Route path="/" element={<Dashboard />} />

        {/* Editor — opened by dashboard or shared link */}
        <Route path="/doc/:docId" element={<BlockEditor />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
