import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ScanPage } from './pages/ScanPage'
import { ComparePage } from './pages/ComparePage'
import { ListsPage } from './pages/ListsPage'
import { StoresPage } from './pages/StoresPage'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<ScanPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/stores" element={<StoresPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
