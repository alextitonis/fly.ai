import { AppLayout } from './components/layout/AppLayout';
import { Dashboard } from './features/dashboard/Dashboard';

export default function App() {
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}
