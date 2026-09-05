// src/api/client.js
// ─────────────────────────────────────────────────────────────────────────────
// All HTTP calls from the React frontend go through here.
// VITE_API_BASE_URL now points to the Node.js middleware (localhost:5000).
// The Node layer handles caching, MongoDB persistence, and AI proxying.
// ─────────────────────────────────────────────────────────────────────────────

const BASE = import.meta.env.VITE_API_BASE_URL ?? '';

// ── Helper ────────────────────────────────────────────────────────────────────

/**
 * Shared fetch wrapper that normalises error responses from both the Node
 * middleware and the underlying Python AI service.
 */
async function apiFetch(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);

  if (!res.ok) {
    let detail = `API error: ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
      else if (body?.detail?.error) detail = body.detail.error;
      else if (typeof body?.detail === "string") detail = body.detail;
    } catch (parseErr) {
      // Body is not JSON — keep the HTTP status-code message as the error detail
    }
    throw new Error(detail);
  }

  return res.json();
}

// ── Investigation endpoints ───────────────────────────────────────────────────

/**
 * POST /api/investigate  — Run (or return cached) CRN investigation.
 * The Node layer will serve a cached MongoDB result if the same CRN was
 * already investigated today, skipping the expensive AI pipeline.
 *
 * @param {string} crn  UK Company Registration Number
 * @returns {Promise<object>}  Investigation result payload (may include `_cached: true`)
 */
export async function investigateByAPI(crn) {
  return apiFetch("/api/investigate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crn }),
  });
}

/**
 * POST /api/investigate/document  — PDF-based investigation.
 * Multipart form forwarded through the Node layer to the Python service.
 *
 * @param {File} pdfFile  PDF file object from the browser
 * @returns {Promise<object>}  Investigation result payload
 */
export async function investigateByDocument(pdfFile) {
  const form = new FormData();
  form.append("file", pdfFile);
  // No Content-Type header — browser sets the correct multipart boundary
  return apiFetch("/api/investigate/document", { method: "POST", body: form });
}

/**
 * POST /approve/:threadId  — Resume a paused HITL investigation.
 * Still proxied through Node (which forwards to Python).
 *
 * @param {string} threadId
 * @param {File}   pdfFile
 */
export async function resumeInvestigation(threadId, pdfFile) {
  const form = new FormData();
  form.append("file", pdfFile);
  return apiFetch(`/approve/${threadId}`, { method: "POST", body: form });
}

// ── History endpoints (new — served by Node/MongoDB) ─────────────────────────

/**
 * GET /api/history?page=1&limit=10
 * Returns a paginated list of all past investigations from MongoDB.
 *
 * @param {number} page   Page number (1-indexed)
 * @param {number} limit  Results per page (max 50)
 * @returns {Promise<{ investigations: object[], total: number, page: number, pages: number }>}
 */
export async function getHistory(page = 1, limit = 10) {
  return apiFetch(`/api/history?page=${page}&limit=${limit}`);
}

/**
 * GET /api/history/:crn
 * Returns all investigation runs for a specific company CRN.
 *
 * @param {string} crn
 * @returns {Promise<{ crn: string, investigations: object[] }>}
 */
export async function getCompanyHistory(crn) {
  return apiFetch(`/api/history/${encodeURIComponent(crn)}`);
}

/**
 * POST /api/investigate/sar
 * Requests an AI-generated SAR draft for a high-risk investigation.
 *
 * @param {string} crn
 * @returns {Promise<{ sarDraft: string, generatedAt: string, crn: string, companyName: string }>}
 */
export async function generateSar(crn) {
  return apiFetch("/api/investigate/sar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ crn }),
  });
}

// ── Health check ──────────────────────────────────────────────────────────────

/**
 * GET /health  — Checks the Node middleware is alive.
 * @returns {Promise<object>}
 */
export async function healthCheck() {
  return apiFetch("/health");
}
