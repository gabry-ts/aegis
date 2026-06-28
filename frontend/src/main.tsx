import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { EndpointsProvider } from './context/EndpointsContext.jsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <EndpointsProvider>
        <App />
      </EndpointsProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
