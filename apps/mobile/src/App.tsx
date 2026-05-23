import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Inbox from "./pages/Inbox";

export default function App() {
  // TODO P5: replace with real auth check from Keychain via @capacitor/preferences
  const isAuthenticated = false;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/inbox"
          element={isAuthenticated ? <Inbox /> : <Navigate to="/login" replace />}
        />
        <Route
          path="*"
          element={<Navigate to={isAuthenticated ? "/inbox" : "/login"} replace />}
        />
      </Routes>
    </BrowserRouter>
  );
}
