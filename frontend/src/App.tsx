import { 
  BrowserRouter as Router, 
  Routes, 
  Route, 
  Navigate 
} from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider } from './hooks/useAuth';
import { AuthGuard, PublicGuard } from './components/auth/AuthGuard';
import { Shell } from './components/layout/Shell';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import RideLogsPage from './pages/RideLogsPage';
import RideJourneysPage from './pages/RideJourneysPage';
import SupportInboxPage from './pages/SupportInboxPage';
import HotspotsPage from './pages/HotspotsPage';
import FeedbackListPage from './pages/FeedbackListPage';
import SettingsPage from './pages/SettingsPage';
import AdminUsersPage from './pages/AdminUsersPage';
import MobileUsersPage from './pages/MobileUsersPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            {/* Public Routes */}
            <Route element={<PublicGuard />}>
              <Route path="/login" element={<LoginPage />} />
            </Route>

            {/* Private Routes */}
            <Route element={<AuthGuard />}>
              <Route element={<Shell />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/rides/logs" element={<RideLogsPage />} />
                <Route path="/rides/journeys" element={<RideJourneysPage />} />
                <Route path="/rides/hotspots" element={<HotspotsPage />} />
                <Route path="/support/inbox" element={<SupportInboxPage />} />
                <Route path="/feedback" element={<FeedbackListPage />} />
                <Route path="/users/mobile" element={<MobileUsersPage />} />
                <Route path="/settings/profile" element={<SettingsPage />} />
                <Route path="/settings/admin-users" element={<AdminUsersPage />} />
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}
