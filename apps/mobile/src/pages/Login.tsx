import { useAuth } from "../contexts/AuthContext";

export default function Login() {
  const { signIn } = useAuth();

  return (
    <main style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      height: "100%",
      padding: "2rem",
      paddingTop: "calc(2rem + var(--safe-top))",
      paddingBottom: "calc(2rem + var(--safe-bottom))",
      background: "var(--color-bg)",
      gap: "1.5rem",
    }}>
      <div style={{ textAlign: "center" }}>
        <h1 style={{ fontSize: "2.5rem", fontWeight: 700, letterSpacing: "-0.5px" }}>
          Cmail
        </h1>
        <p style={{ color: "var(--color-text-secondary)", marginTop: "0.5rem", fontSize: "1rem" }}>
          Gmail をもっと賢く
        </p>
      </div>

      <button
        onClick={signIn}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0.875rem 1.75rem",
          background: "var(--color-primary)",
          color: "#fff",
          borderRadius: "14px",
          fontSize: "1rem",
          fontWeight: 600,
          width: "100%",
          maxWidth: "320px",
        }}
      >
        Google でサインイン
      </button>
    </main>
  );
}
