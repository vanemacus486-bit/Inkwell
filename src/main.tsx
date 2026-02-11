import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './themes.css'

const saved = localStorage.getItem('inkwell-theme')
if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
  document.documentElement.setAttribute('data-theme', 'dark')
} else {
  document.documentElement.setAttribute('data-theme', 'light')
}

ReactDOM.createRoot(document.getElementById('root')!).render(<App />)
