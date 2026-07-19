import './globals.css';
import { AuthProvider } from '@/hooks/useAuth';

export const metadata = {
  title: 'SockPit — SOCKS5 Proxy Management Dashboard',
  description: 'Enterprise Multi-tenant SOCKS5 Proxy Deployment and Monitoring SaaS Platform',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
