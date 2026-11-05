import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Consultation from './pages/Consultation'
import Prescriptions from './pages/Prescriptions'
import Settings from './pages/Settings'
import Profile from './pages/Profile'

// Saari pages yahan define hain — URL ke hisaab se component dikhega
export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/consultation" element={<Consultation />} />
      <Route path="/prescriptions" element={<Prescriptions />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/profile" element={<Profile />} />
    </Routes>
  )
}