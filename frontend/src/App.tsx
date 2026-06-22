import { Routes, Route, Navigate } from 'react-router-dom'
import { useThemeStore } from '@/store/theme'
import { useEffect } from 'react'
import Layout from '@/components/Layout'
import Onboarding from '@/components/Onboarding'
import ErrorBoundary from '@/components/ErrorBoundary'
import { initAutoBackup } from '@/lib/backup'

// CRM & Auth Pages
import Login from '@/pages/Login'
import Register from '@/pages/Register'
import ScheduleCRM from '@/pages/ScheduleCRM'
import PaymentsCRM from '@/pages/PaymentsCRM'
import PhotosCRM from '@/pages/PhotosCRM'
import EstimateCRM from '@/pages/EstimateCRM'
import RequestsCRM from '@/pages/RequestsCRM'
import ClientPortal from '@/pages/ClientPortal'

// Legacy/Existing Pages
import Dashboard from '@/pages/Dashboard'
import Estimates from '@/pages/Estimates'
import EstimateDetail from '@/pages/EstimateDetail'
import CreateEstimate from '@/pages/CreateEstimate'
import Works from '@/pages/Works'
import Materials from '@/pages/Materials'
import KS2List from '@/pages/KS2List'
import KS3List from '@/pages/KS3List'
import Contracts from '@/pages/Contracts'
import Clients from '@/pages/Clients'
import AIAssistant from '@/pages/AIAssistant'
import PhotoScanner from '@/pages/PhotoScanner'
import Settings from '@/pages/Settings'
import ImportData from '@/pages/ImportData'
import CommercialProposal from '@/pages/CommercialProposal'
import Contractors from '@/pages/Contractors'
import Workers from '@/pages/Workers'
import MaterialRequests from '@/pages/MaterialRequests'
import References from '@/pages/References'
import Documents from '@/pages/Documents'
import ProjectCalendar from '@/pages/ProjectCalendar'
import M29List from '@/pages/M29List'
import Templates from '@/pages/Templates'
import Activation from '@/pages/Activation'
import Purchase from '@/pages/Purchase'
import FOT from '@/pages/FOT'
import PriceReference from '@/pages/PriceReference'
import Pipeline from '@/pages/Pipeline'
import Analytics from '@/pages/Analytics'
import CRM from '@/pages/CRM'
import Resources from '@/pages/Resources'
import Invoices from '@/pages/Invoices'
import CompetitorAnalysis from '@/pages/CompetitorAnalysis'
import HandwritingOCR from '@/pages/HandwritingOCR'
import DirectorDashboard from '@/pages/DirectorDashboard'
import LocalPrices from '@/pages/LocalPrices'

import { ToastContainer } from '@/components/ToastContainer'
import { useGlobalHotkeys } from '@/lib/useHotkeys'

// Защита авторизацией
function AuthGuard({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('access_token')
  if (!token) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

function App() {
  const { isDark } = useThemeStore()

  useGlobalHotkeys()

  useEffect(() => {
    initAutoBackup()
  }, [])

  return (
    <div className={isDark ? 'dark' : ''}>
      <Onboarding />
      <Routes>
        {/* Публичные роуты (без авторизации) */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/purchase" element={<Purchase />} />
        <Route path="/public/project/:token" element={<ClientPortal />} />

        {/* Защищенные роуты CRM */}
        <Route path="/" element={<AuthGuard><Layout /></AuthGuard>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="pipeline" element={<Pipeline />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="templates" element={<Templates />} />
          <Route path="settings" element={<Settings />} />
          <Route path="estimates" element={<Estimates />} />
          <Route path="estimates/new" element={<CreateEstimate />} />
          <Route path="estimates/:id" element={<ErrorBoundary><EstimateDetail /></ErrorBoundary>} />
          <Route path="estimates/:id/crm" element={<ErrorBoundary><EstimateCRM /></ErrorBoundary>} />
          
          <Route path="works" element={<Works />} />
          <Route path="materials" element={<Materials />} />
          <Route path="ks2" element={<KS2List />} />
          <Route path="ks3" element={<KS3List />} />
          <Route path="contracts" element={<Contracts />} />
          <Route path="clients" element={<Clients />} />
          <Route path="ai" element={<ErrorBoundary><AIAssistant /></ErrorBoundary>} />
          <Route path="scanner" element={<ErrorBoundary><PhotoScanner /></ErrorBoundary>} />
          <Route path="import" element={<ImportData />} />
          <Route path="commercial-proposal" element={<CommercialProposal />} />
          <Route path="contractors" element={<Contractors />} />
          <Route path="workers" element={<Workers />} />
          <Route path="material-requests" element={<MaterialRequests />} />
          <Route path="references" element={<References />} />
          <Route path="documents" element={<Documents />} />
          <Route path="calendar" element={<ProjectCalendar />} />
          <Route path="m29" element={<M29List />} />
          <Route path="templates" element={<Templates />} />
          <Route path="fot" element={<FOT />} />
          <Route path="prices" element={<PriceReference />} />
          <Route path="settings" element={<Settings />} />
          <Route path="activation" element={<Activation />} />
          
          {/* CRM модули */}
          <Route path="crm" element={<CRM />} />
          <Route path="schedule" element={<ScheduleCRM />} />
          <Route path="payments" element={<PaymentsCRM />} />
          <Route path="photos" element={<PhotosCRM />} />
          <Route path="requests" element={<RequestsCRM />} />
          
          <Route path="resources" element={<Resources />} />
          <Route path="invoices" element={<Invoices />} />
          <Route path="competitor-analysis" element={<ErrorBoundary><CompetitorAnalysis /></ErrorBoundary>} />
          <Route path="handwriting-ocr" element={<ErrorBoundary><HandwritingOCR /></ErrorBoundary>} />
          <Route path="director" element={<ErrorBoundary><DirectorDashboard /></ErrorBoundary>} />
          <Route path="local-prices" element={<ErrorBoundary><LocalPrices /></ErrorBoundary>} />
        </Route>
      </Routes>
      <ToastContainer />
    </div>
  )
}

export default App
