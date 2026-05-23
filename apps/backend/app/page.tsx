// Landing page if someone hits the bare domain. The real app lives on
// the iPhone — this is just a "you found the wrong place" notice.

export default function Home() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: "2rem", maxWidth: 640, margin: "0 auto" }}>
      <h1>Cmail Backend</h1>
      <p>This server hosts the API for the Cmail iOS app. There is no web UI here.</p>
      <p>
        Looking for Cmail itself? It's a private desktop + iOS mail client.
      </p>
      <hr style={{ margin: "1.5rem 0" }} />
      <p style={{ fontSize: "0.85rem", color: "#666" }}>
        Health: <a href="/api/health">/api/health</a>
      </p>
    </main>
  );
}
