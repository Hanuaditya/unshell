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
const localCache = require("../services/localCache");

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
    const isDbConnected = require("mongoose").connection.readyState === 1;

    // 2a. MongoDB same-day cache check (if DB is connected)
    if (isDbConnected) {
      try {
        const cached = await Investigation.findOne({
          crn: normalisedCRN,
          timestamp: { $gte: todayMidnight() },
        })
          .sort({ timestamp: -1 })
          .lean();

        if (cached) {
          console.log(`[MONGO CACHE HIT] CRN ${normalisedCRN} — returning stored result.`);
          return res.json({
            ...cached.rawResult,
            _cached: true,
            _cacheSource: 'mongodb',
            _cachedAt: cached.timestamp,
          });
        }
      } catch (cacheErr) {
        console.warn("[CACHE WARNING]", cacheErr.message);
      }
    }

    // 2b. Local disk cache fallback (works even when MongoDB is unreachable)
    const localHit = localCache.get(normalisedCRN)
    if (localHit) {
      return res.json({
        ...localHit,
        _cached: true,
        _cacheSource: 'local_disk',
        _cachedAt: new Date().toISOString(),
      })
    }

    // 3. Call the Python AI microservice
    console.log(`[PROXY] CRN ${normalisedCRN} — forwarding to AI service…`);
    const aiResult = await callInvestigateAPI(normalisedCRN);

    // 4a. Persist to local disk cache (always — fastest & offline-safe)
    localCache.set(normalisedCRN, aiResult)

    // 4b. Persist to MongoDB (if DB is connected)
    let savedId = null;
    if (isDbConnected) {
      try {
        const parsed = parseAIResult(aiResult);
        const doc = await Investigation.create({
          crn: normalisedCRN,
          ...parsed,
        });
        savedId = doc._id;
        console.log(`[SAVED] Investigation ${doc._id} for CRN ${normalisedCRN} saved to MongoDB.`);
      } catch (saveErr) {
        console.warn("[SAVE WARNING]", saveErr.message);
      }
    }

    // 5. Return the original AI payload (plus internal metadata)
    return res.json({
      ...aiResult,
      _cached: false,
      _savedId: savedId,
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
    const isDbConnected = require("mongoose").connection.readyState === 1;
    if (!isDbConnected) {
      return res.json({
        investigations: [],
        total: 0,
        page: 1,
        pages: 0,
        warning: "MongoDB is not connected; history unavailable."
      });
    }

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

    const isDbConnected = require("mongoose").connection.readyState === 1;

    // ── Step 1: Find investigation (MongoDB first, then local disk cache) ──────
    let investigation = null;

    if (isDbConnected) {
      investigation = await Investigation.findOne({ crn })
        .sort({ timestamp: -1 })
        .lean();
    }

    // Fallback: check local disk cache if not found in MongoDB
    if (!investigation) {
      const localHit = localCache.get(crn);
      if (localHit) {
        console.log(`[SAR] CRN ${crn} — not in MongoDB, found in local cache. Auto-saving to MongoDB...`);
        if (isDbConnected) {
          try {
            // Persist the locally-cached result to MongoDB so SAR can be saved
            const parsed = parseAIResult(localHit);
            const doc = await Investigation.create({ crn, ...parsed });
            investigation = await Investigation.findById(doc._id).lean();
            console.log(`[SAR] Auto-saved investigation ${doc._id} for CRN ${crn} to MongoDB.`);
          } catch (saveErr) {
            console.warn(`[SAR] Auto-save to MongoDB failed: ${saveErr.message}`);
            // Build a minimal investigation object so SAR generation can still proceed
            investigation = { ...parseAIResult(localHit), crn, _id: null, rawResult: localHit };
          }
        } else {
          // No DB — build a minimal object from local cache
          investigation = { ...parseAIResult(localHit), crn, _id: null, rawResult: localHit };
        }
      }
    }

    if (!investigation) {
      return res.status(404).json({ message: "No investigation found for this CRN. Run an investigation first." });
    }

    if ((investigation.riskScore || 0) < 65) {
      return res.status(403).json({ message: "SAR drafting is only available for high-risk investigations (score >= 65)." });
    }

    // ── Step 2: Build payload and call AI service ─────────────────────────────
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

    // ── Step 3: Persist SAR to MongoDB ────────────────────────────────────────
    if (isDbConnected && investigation._id) {
      try {
        const mongoose = require("mongoose");
        const updateResult = await Investigation.updateOne(
          { _id: new mongoose.Types.ObjectId(investigation._id) },
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
        if (updateResult.modifiedCount === 1) {
          console.log(`[SAR] ✅ SAR draft saved to MongoDB for CRN ${crn} (investigation ${investigation._id})`);
        } else {
          console.warn(`[SAR] ⚠️ updateOne matched ${updateResult.matchedCount} / modified ${updateResult.modifiedCount} — SAR may not have saved.`);
        }
      } catch (saveErr) {
        console.error(`[SAR] ❌ Failed to save SAR to MongoDB: ${saveErr.message}`);
      }
    } else {
      console.warn(`[SAR] ⚠️ SAR generated but NOT saved to MongoDB (DB disconnected or no _id).`);
    }

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
