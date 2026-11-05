import DashboardLayout from '../components/layout/DashboardLayout'

// Abhi sirf placeholder — baad mein real list aayegi
export default function Prescriptions() {
  return (
    <DashboardLayout>
      <h1 className="text-2xl font-bold">Prescriptions</h1>
      <p className="mt-2 text-slate-400">Yahan pehle ki prescriptions dikhengi. Abhi placeholder hai.</p>
      <div className="mt-6 rounded-xl bg-panel p-5 text-sm text-slate-300">
        Coming soon – recent prescriptions list.
      </div>
    </DashboardLayout>
  )
}