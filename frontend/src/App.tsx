import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { AuthProvider } from './context/AuthContext'
import { SettingsProvider } from './context/SettingsContext'
import { DashboardPage } from './features/dashboard/DashboardPage'
import { ExerciseLibraryPage } from './features/lifting/ExerciseLibraryPage'
import { LiftingPage } from './features/lifting/LiftingPage'
import { TemplateEditorPage } from './features/lifting/TemplateEditorPage'
import { TemplateListPage } from './features/lifting/TemplateListPage'
import { WorkoutLoggerPage } from './features/lifting/WorkoutLoggerPage'
import { WeightPage } from './features/weight/WeightPage'
import { ExerciseDetailPage } from './pages/ExerciseDetailPage'
import { LoginPage } from './pages/LoginPage'
import { RunningPage } from './pages/RunningPage'
import { SettingsPage } from './pages/SettingsPage'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
})

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <SettingsProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route
                element={
                  <RequireAuth>
                    <Layout />
                  </RequireAuth>
                }
              >
                <Route path="/" element={<DashboardPage />} />
                <Route path="/weight" element={<WeightPage />} />
                <Route path="/lifting" element={<LiftingPage />} />
                <Route path="/lifting/exercises" element={<ExerciseLibraryPage />} />
                <Route path="/lifting/exercises/:id" element={<ExerciseDetailPage />} />
                <Route path="/lifting/workouts/:id" element={<WorkoutLoggerPage />} />
                <Route path="/lifting/templates" element={<TemplateListPage />} />
                <Route path="/lifting/templates/:id" element={<TemplateEditorPage />} />
                <Route path="/running" element={<RunningPage />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </SettingsProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}
