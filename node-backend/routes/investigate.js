// routes/investigate.js
// ─────────────────────────────────────────────────────────────────────────────
// Express router for all /api/investigate and /api/history endpoints.
// Mounted at /api in server.js.
// ─────────────────────────────────────────────────────────────────────────────

const express = require("express");
const router = express.Router();

const {
  postInvestigate,
  getHistory,
  getCompanyHistory,
  generateSar,
} = require("../controllers/investigateController");

// ── Investigation routes ──────────────────────────────────────────────────────

/**
 * POST /api/investigate
 * Body: { "crn": "09446231" }
 * → Cache check → Python AI proxy → MongoDB save → response
 */
router.post("/investigate", postInvestigate);

/**
 * POST /api/investigate/sar
 * Body: { "crn": "09446231" }
 * → Fetch cached → AI SAR Draft → MongoDB update → response
 */
router.post("/investigate/sar", generateSar);

// ── History routes ────────────────────────────────────────────────────────────

/**
 * GET /api/history?page=1&limit=10
 * → Paginated list of all past investigations (rawResult omitted for brevity)
 */
router.get("/history", getHistory);

/**
 * GET /api/history/:crn
 * → Full history for a single company CRN
 */
router.get("/history/:crn", getCompanyHistory);

module.exports = router;
