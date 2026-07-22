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
import CategoriesPage from './pages/CategoriesPage';
import ProductsPage from './pages/ProductsPage';
import GrnFormPage from './pages/forms/GrnFormPage';
import AssignmentFormPage from './pages/forms/AssignmentFormPage';
import TransferFormPage from './pages/forms/TransferFormPage';
import MicFormPage from './pages/forms/MicFormPage';
import './styles/global.css';
import StockReportPage from './pages/StockReportPage';

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
                <Route path="/stock-report" element={<RequireRole roles={['admin', 'manager']}><StockReportPage /></RequireRole>} />
                <Route path="/forms/grn" element={<RequireRole roles={['admin', 'manager']}><GrnFormPage /></RequireRole>} />
                <Route path="/forms/assignments" element={<RequireRole roles={['admin', 'manager']}><AssignmentFormPage /></RequireRole>} />
                <Route path="/forms/transfers" element={<RequireRole roles={['admin', 'manager']}><TransferFormPage /></RequireRole>} />
                {/* Open to workers: the person who did the install fills this one in. */}
                <Route path="/forms/mic" element={<MicFormPage />} />
              <Route path="/categories" element={<RequireRole roles={['admin', 'manager']}><CategoriesPage /></RequireRole>} />
              <Route path="/products" element={<RequireRole roles={['admin', 'manager']}><ProductsPage /></RequireRole>} />
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