import React from 'react'
import * as ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// minimal entry: no image imports or app config references

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
