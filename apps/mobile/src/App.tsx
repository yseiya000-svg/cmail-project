import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import Inbox from "./pages/Inbox";
import EmailDetail from "./pages/EmailDetail";
import AuthCallback from "./pages/AuthCallback";

function AppRoutes() {
  const { token } = useAuth();

  return (
    <Routes>
      {/* OAuth コールバック — 認証状態に関係なく常にアクセス可能 */}
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/inbox"
        element={token ? <Inbox /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/inbox/:id"
        element={token ? <EmailDetail /> : <Navigate to="/login" replace />}
      />
      <Route
        path="*"
        element={<Navigate to={token ? "/inbox" : "/login"} replace />}
      />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}
