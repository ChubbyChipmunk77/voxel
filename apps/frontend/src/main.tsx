import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import GamePage from './pages/GamePage.tsx'

createRoot(document.getElementById('root')!).render(
  // <StrictMode>
  <BrowserRouter>
    <Routes>
      <Route path='/' element={<App />}></Route>
      <Route path='/meet/:roomslug' element={<GamePage />}></Route>
    </Routes>
  </BrowserRouter>
  // </StrictMode>,
)
