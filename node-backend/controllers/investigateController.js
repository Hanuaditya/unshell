// controllers/investigateController.js
// ─────────────────────────────────────────────────────────────────────────────
// Business logic for all /api/investigate and /api/history endpoints.
//
// Cache strategy:
//   Before calling the Python AI pipeline, check whether an investigation for
//   the same CRN already exists in MongoDB *today* (midnight → now). If yes,
//   return the cached document immediately — saving ~60–120 s of AI compute.
// ─────────────────────────────────────────────────────────────────────────────

const Investigation = require("../models/Investigation");
const { callInvestigateAPI, generateSar: callGenerateSarAPI } = require("../services/aiServiceClient");

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns a Date set to 00:00:00 today (local midnight), used as the lower
 * bound for the same-day cache window.
 */
function todayMidnight() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Extracts a clean subset of fields from the raw AI payload to populate the
 * Mongoose document. Adjust these field names if the Python schema changes.
 *
 * @param {object} aiResult  Raw response from the Python FastAPI service
 * @returns {object}  Flattened fields for the Investigation model
 */
function parseAIResult(aiResult) {
  let status = aiResult?.status || "Completed";
  if (status.toLowerCase() === "complete") {
    status = "Completed";
  }

  return {
    companyName: aiResult?.company_name || aiResult?.companyName || "Unknown",
    riskScore:
      aiResult?.risk_score ?? aiResult?.riskScore ?? null,
    status: status,
    graphData: aiResult?.graph || aiResult?.graphData || null,
    rawResult: aiResult,
  };
}

// ── Controllers ───────────────────────────────────────────────────────────────

/**
 * POST /api/investigate
 *
 * Body: { "crn": "09446231" }
 *
 * Flow:
 *  1. Validate CRN presence
 *  2. Cache check — if investigated today, return stored doc
 *  3. Call Python AI microservice
 *  4. Persist result in MongoDB
 *  5. Return result to frontend
 */
exports.postInvestigate = async (req, res) => {
  try {
    const { crn } = req.body;

    // 1. Input validation
    if (!crn || typeof crn !== "string" || crn.trim() === "") {
      return res.status(400).json({ error: "A valid CRN string is required." });
    }

    const normalisedCRN = crn.trim().toUpperCase();

    // 2. Same-day cache check
    const cached = await Investigation.findOne({
      crn: normalisedCRN,
      timestamp: { $gte: todayMidnight() },
    })
      .sort({ timestamp: -1 })
      .lean();

    if (cached) {
      console.log(`[CACHE HIT] CRN ${normalisedCRN} — returning stored result.`);
      return res.json({
        ...cached.rawResult,
        _cached: true,
        _cachedAt: cached.timestamp,
      });
    }

    // 3. Call the Python AI microservice
    console.log(`[PROXY] CRN ${normalisedCRN} — forwarding to AI service…`);
    const aiResult = await callInvestigateAPI(normalisedCRN);

    // 4. Persist to MongoDB
    const parsed = parseAIResult(aiResult);
    const doc = await Investigation.create({
      crn: normalisedCRN,
      ...parsed,
    });

    console.log(`[SAVED] Investigation ${doc._id} for CRN ${normalisedCRN} saved to MongoDB.`);

    // 5. Return the original AI payload (plus internal metadata)
    return res.json({
      ...aiResult,
      _cached: false,
      _savedId: doc._id,
    });
  } catch (err) {
    console.error("[investigateController.postInvestigate]", err.message);

    // Distinguish AI-service-down from other errors
    if (
      err.message.includes("unreachable") ||
      err.message.includes("timed out")
    ) {
      return res.status(503).json({
        error: err.message,
        type: "AIServiceUnavailable",
      });
    }

    return res.status(500).json({ error: err.message, type: err.name });
  }
};

/**
 * GET /api/history?page=1&limit=10
 *
 * Returns a paginated list of all past investigations, newest first.
 * Response shape:
 *  {
 *    investigations: [...],
 *    total: 42,
 *    page: 1,
 *    pages: 5
 *  }
 */
exports.getHistory = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 10));
    const skip = (page - 1) * limit;

    const [investigations, total] = await Promise.all([
      Investigation.find()
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .select("-rawResult")  // Omit the heavy raw payload from list view
        .lean(),
      Investigation.countDocuments(),
    ]);

    return res.json({
      investigations,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error("[investigateController.getHistory]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * GET /api/history/:crn
 *
 * Returns the full history for a single company CRN (all runs, newest first).
 */
exports.getCompanyHistory = async (req, res) => {
  try {
    const crn = req.params.crn.trim().toUpperCase();

    const investigations = await Investigation.find({ crn })
      .sort({ timestamp: -1 })
      .lean();

    if (!investigations.length) {
      return res.status(404).json({ error: `No investigation history found for CRN: ${crn}` });
    }

    return res.json({ crn, investigations });
  } catch (err) {
    console.error("[investigateController.getCompanyHistory]", err.message);
    return res.status(500).json({ error: err.message });
  }
};

/**
 * POST /api/investigate/sar
 *
 * Body: { "crn": "09446231" }
 */
exports.generateSar = async (req, res) => {
  try {
    const crn = req.body.crn?.trim().toUpperCase();
    if (!crn) {
      return res.status(400).json({ error: "CRN is required." });
    }

    const investigation = await Investigation.findOne({ crn })
      .sort({ timestamp: -1 })
      .lean();

    if (!investigation) {
      return res.status(404).json({ message: "No investigation found for this CRN. Run an investigation first." });
    }

    if ((investigation.riskScore || 0) < 65) {
      return res.status(403).json({ message: "SAR drafting is only available for high-risk investigations (score >= 65)." });
    }

    const payload = {
      crn,
      companyName: investigation.companyName,
      riskScore: investigation.riskScore,
      fatalFlags: investigation.rawResult?.fatal_flags || [],
      cumulativeVectors: investigation.rawResult?.cumulative_vectors || [],
      graphData: investigation.graphData || { nodes: [], edges: [] },
      resolvedUbo: investigation.rawResult?.resolved_ubo,
      sanctionsHit: investigation.rawResult?.sanctions_hit || false,
      sanctionsDetail: investigation.rawResult?.sanctions_detail,
    };

    console.log(`[SAR] CRN ${crn} — generating draft...`);
    const aiResult = await callGenerateSarAPI(payload);

    await Investigation.updateOne(
      { _id: investigation._id },
      {
        $push: {
          sarDrafts: {
            text: aiResult.sarDraft,
            generatedAt: new Date(aiResult.generatedAt),
          },
          sarAuditLog: {
            requestedBy: "analyst",
            promptSent: "System Prompt + Structured JSON Data",
            draftReturned: aiResult.sarDraft,
            timestamp: new Date(),
          },
        },
      }
    );

    return res.json({
      sarDraft: aiResult.sarDraft,
      generatedAt: aiResult.generatedAt,
      crn,
      companyName: investigation.companyName,
    });
  } catch (err) {
    console.error("[investigateController.generateSar]", err.message);
    if (err.message.includes("unreachable") || err.message.includes("timed out")) {
      return res.status(503).json({ error: err.message, type: "AIServiceUnavailable" });
    }
    return res.status(500).json({ error: err.message });
  }
};
