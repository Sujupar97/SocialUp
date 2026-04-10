import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { MainLayout } from './components/layout';
import Dashboard from './pages/Dashboard';
import Accounts from './pages/Accounts';
import Upload from './pages/Upload';
import Distribution from './pages/Distribution';
import Analytics from './pages/Analytics';
import TermsOfService from './pages/TermsOfService';
import PrivacyPolicy from './pages/PrivacyPolicy';
import { AccountCreation } from './pages/AccountCreation';

const router = createBrowserRouter([
    {
        path: '/',
        element: <MainLayout />,
        children: [
            {
                index: true,
                element: <Dashboard />,
            },
            {
                path: 'accounts',
                element: <Accounts />,
            },
            {
                path: 'account-creation',
                element: <AccountCreation />,
            },
            {
                path: 'upload',
                element: <Upload />,
            },
            {
                path: 'distribution',
                element: <Distribution />,
            },
            {
                path: 'analytics',
                element: <Analytics />,
            },
            {
                path: 'terms',
                element: <TermsOfService />,
            },
            {
                path: 'privacy',
                element: <PrivacyPolicy />,
            },
        ],
    },
]);

export const AppRouter: React.FC = () => {
    return <RouterProvider router={router} />;
};

export default AppRouter;

