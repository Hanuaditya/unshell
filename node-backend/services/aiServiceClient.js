// services/aiServiceClient.js
// ─────────────────────────────────────────────────────────────────────────────
// Axios wrapper around the internal Python FastAPI AI microservice.
//
// This is the ONLY place in the Node layer that knows the AI service URL.
// All other modules call these exported functions — keeping the proxy logic
// isolated and easy to swap out (e.g. if the Python service moves to Docker).
// ─────────────────────────────────────────────────────────────────────────────

const axios = require("axios");

// Build the base Axios instance once — all calls reuse the same config
const aiClient = axios.create({
  baseURL: process.env.AI_SERVICE_URL || "http://localhost:8001",

  // The LangGraph pipeline can take up to 2 minutes for a deep investigation
  timeout: 130_000,  // 130 s (slightly above FastAPI's 120 s internal timeout)

  headers: {
    "Content-Type": "application/json",
    Accept: "application/json",
  },
});

// ── Helper: normalise Axios errors into a clean JS Error ─────────────────────
function wrapAxiosError(err, label) {
  if (err.code === "ECONNREFUSED" || err.code === "ENOTFOUND") {
    return new Error(
      `AI service is unreachable (${process.env.AI_SERVICE_URL}). ` +
        "Make sure the Python FastAPI server is running on port 8001."
    );
  }
  if (err.response) {
    // Python returned a 4xx/5xx
    const detail =
      err.response.data?.detail?.error ||
      err.response.data?.detail ||
      err.response.statusText;
    return new Error(`AI service [${label}] responded ${err.response.status}: ${detail}`);
  }
  if (err.code === "ECONNABORTED") {
    return new Error(`AI service [${label}] timed out after 130 s.`);
  }
  return err;
}

// ── Exported API ──────────────────────────────────────────────────────────────

/**
 * POST /investigate  →  full CRN-based investigation
 * @param {string} crn  UK Company Registration Number
 * @returns {Promise<object>}  AI pipeline result payload
 */
async function callInvestigateAPI(crn) {
  try {
    const response = await aiClient.post("/investigate", { crn, mode: "api" });
    return response.data;
  } catch (err) {
    throw wrapAxiosError(err, "POST /investigate");
  }
}

/**
 * POST /investigate/document  →  PDF-based investigation
 * @param {FormData} formData  Multipart form containing the PDF file
 * @returns {Promise<object>}  AI pipeline result payload
 */
async function callInvestigateDocument(formData) {
  try {
    const response = await aiClient.post("/investigate/document", formData, {
      headers: {
        // Let Axios/FormData set the correct multipart boundary automatically
        ...formData.getHeaders(),
      },
    });
    return response.data;
  } catch (err) {
    throw wrapAxiosError(err, "POST /investigate/document");
  }
}

/**
 * POST /generate_sar  →  SAR Draft Generation
 * @param {object} payload  Structured investigation data
 * @returns {Promise<object>} SAR draft result
 */
async function generateSar(payload) {
  try {
    const response = await aiClient.post("/generate_sar", payload);
    return response.data;
  } catch (err) {
    throw wrapAxiosError(err, "POST /generate_sar");
  }
}

module.exports = { callInvestigateAPI, callInvestigateDocument, generateSar };
