import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ScanPage } from './pages/ScanPage'
import { ComparePage } from './pages/ComparePage'
import { ListsPage } from './pages/ListsPage'
import { StoresPage } from './pages/StoresPage'
import { ImportScreenshotPage } from './pages/ImportScreenshotPage'

function App() {
  return (
    // BASE_URL reflects the `base` set in vite.config.ts — '/' locally,
    // '/gougegauge/' for the GitHub Pages build — so routes resolve
    // correctly under either.
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <Routes>
        <Route path="/" element={<ScanPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/lists" element={<ListsPage />} />
        <Route path="/stores" element={<StoresPage />} />
        {/* Not in the bottom nav — reached via a link from the Scan page.
            See ImportScreenshotPage's docstring for why (M5.5). */}
        <Route path="/import" element={<ImportScreenshotPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
