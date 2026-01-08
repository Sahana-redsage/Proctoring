const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

/**
 * CANDIDATE ENDPOINTS
 */

export async function startSession(examId = crypto.randomUUID(), candidateId = crypto.randomUUID()) {
  const res = await fetch(`${BASE_URL}/sessions/start?exam_id=${examId}&candidate_id=${candidateId}`, {
    method: "POST",
  });
  return res.json();
}

export async function uploadReferencePhoto(sessionId, fileBlob) {
  const formData = new FormData();
  formData.append("file", fileBlob, "reference.jpg");
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/reference-photo`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function uploadChunk(sessionId, chunkIndex, fileBlob) {
  const formData = new FormData();
  formData.append("file", fileBlob, `chunk_${chunkIndex}.webm`);
  const res = await fetch(`${BASE_URL}/chunks/${sessionId}/${chunkIndex}`, {
    method: "POST",
    body: formData,
  });
  return res.json();
}

export async function endSession(sessionId, lastChunkIndex) {
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}/end?last_chunk_index=${lastChunkIndex}`, {
    method: "POST",
  });
  return res.json();
}

/**
 * ADMIN ENDPOINTS
 */

export async function getAdminSessions() {
  const res = await fetch(`${BASE_URL}/admin/sessions`);
  const data = await res.json();
  // Backend returns a list of sessions
  return { success: true, sessions: data };
}

export async function getAdminSessionEvents(sessionId) {
  const res = await fetch(`${BASE_URL}/admin/sessions/${sessionId}/events`);
  const data = await res.json();
  return { success: true, events: data };
}

export async function getAdminSessionVideo(sessionId) {
  const res = await fetch(`${BASE_URL}/admin/sessions/${sessionId}/video`);
  const data = await res.json();
  return { success: true, videoUrl: data.final_video_url };
}
