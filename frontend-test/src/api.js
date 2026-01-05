const BASE = "http://localhost:3000/api/v2/proctoring";

export async function startSession() {
  const res = await fetch(`${BASE}/session/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      examId: crypto.randomUUID(),
      candidateId: crypto.randomUUID()
    })
  });
  return res.json();
}

export async function uploadChunk(formData) {
  return fetch(`${BASE}/chunk/upload`, {
    method: "POST",
    body: formData
  });
}

export async function uploadReferenceImage(formData) {
  const res = await fetch(`${BASE}/session/reference-image`, {
    method: "POST",
    body: formData
  });
  return res.json();
}

export async function completeSession(sessionId) {
  return fetch(`${BASE}/session/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId })
  });
}

export async function getSessions() {
  const res = await fetch("http://localhost:3000/admin/sessions");
  return res.json();
}

export async function getSessionResult(sessionId) {
  const res = await fetch(`http://localhost:3000/admin/sessions/${sessionId}`);
  return res.json();
}

const ADMIN_BASE = "http://localhost:3000/api/v2/admin";

export async function getAdminSessions() {
  const res = await fetch(`${ADMIN_BASE}/proctoring/sessions`);
  return res.json();
}

export async function getAdminSessionReview(sessionId) {
  const res = await fetch(
    `${ADMIN_BASE}/proctoring/sessions/${sessionId}`
  );
  return res.json();
}
