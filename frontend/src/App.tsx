import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import AppLayout, { RequireRole } from './components/AppLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import AssignmentsPage from './pages/AssignmentsPage';
import TransfersPage from './pages/TransfersPage';
import UsersPage from './pages/UsersPage';
import UsagePage from './pages/UsagePage';
import ReturnRequestsPage from './pages/ReturnRequestsPage';
import ItemRequestsPage from './pages/ItemRequestsPage';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<AppLayout />}>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/inventory" element={<InventoryPage />} />
                <Route path="/assignments" element={<AssignmentsPage />} />
                <Route path="/item-requests" element={<ItemRequestsPage />} />
                <Route path="/transfers" element={<TransfersPage />} />
                <Route path="/returns" element={<ReturnRequestsPage />} />
                <Route path="/usage" element={<UsagePage />} />
                <Route path="/users" element={
                  <RequireRole roles={['admin', 'manager']}>
                    <UsersPage />
                  </RequireRole>
                } />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster
              position="top-right"
              toastOptions={{
                style: {
                  background: 'var(--bg-3)', color: 'var(--text)',
                  border: '1px solid var(--border)', fontSize: 13, borderRadius: 10,
                },
                success: { iconTheme: { primary: 'var(--green)', secondary: 'var(--bg)' } },
                error: { iconTheme: { primary: 'var(--red)', secondary: 'var(--bg)' } },
              }}
            />
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  );
}