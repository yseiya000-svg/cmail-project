import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

const TOKEN_KEY = "cmail_auth_token";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
      navigate("/inbox", { replace: true });
    } else {
      navigate("/login", { replace: true });
    }
  }, [navigate]);

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      background: "var(--color-bg)",
    }}>
      <p style={{ color: "var(--color-text-secondary)" }}>サインイン中...</p>
    </div>
  );
}
