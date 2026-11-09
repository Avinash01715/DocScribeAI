import { Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Consultation from './pages/Consultation'
import Prescriptions from './pages/Prescriptions'
import Settings from './pages/Settings'
import Profile from './pages/Profile'

// Application root component defining routes for all OPD views
export default function App() {
  return (
    <Routes>
      {/* Home dashboard overview */}
      <Route path="/" element={<Dashboard />} />
      {/* Real-time ambient consultation console */}
      <Route path="/consultation" element={<Consultation />} />
      {/* Archived prescriptions and records */}
      <Route path="/prescriptions" element={<Prescriptions />} />
      {/* Application preferences and configuration */}
      <Route path="/settings" element={<Settings />} />
      {/* Clinician credentials and profile details */}
      <Route path="/profile" element={<Profile />} />
    </Routes>
  )
}
