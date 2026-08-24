// models/Investigation.js
// ─────────────────────────────────────────────────────────────────────────────
// Mongoose schema & model for a completed investigation result.
//
// One document = one investigation run for a given CRN.
// The caching logic in investigateController.js queries this collection to
// avoid re-running the expensive Python AI pipeline for the same CRN on the
// same calendar day.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

const InvestigationSchema = new mongoose.Schema(
  {
    // ── Core identifiers ──────────────────────────────────────────────────────
    crn: {
      type: String,
      required: [true, "CRN is required"],
      trim: true,
      uppercase: true,   // Normalise e.g. "09446231" vs "09446231"
      index: true,
    },

    companyName: {
      type: String,
      default: "Unknown",
    },

    // ── Risk assessment ───────────────────────────────────────────────────────
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: null,
    },

    /**
     * Mirrors the pipeline's final verdict:
     *  "Completed"    — investigated, risk score produced, no blockers
     *  "Auto-Reject"  — OFAC/sanctions hit or critical threshold breached
     *  "Human Review" — ambiguous; HITL intervention required
     *  "Error"        — pipeline failed mid-run
     */
    status: {
      type: String,
      enum: ["Completed", "Auto-Reject", "Human Review", "Error"],
      default: "Completed",
    },

    // ── Graph payload ─────────────────────────────────────────────────────────
    // Stores the NetworkX-derived nodes + edges JSON from the Python service.
    // Using mongoose.Schema.Types.Mixed allows arbitrary nested objects.
    graphData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── Full AI payload ───────────────────────────────────────────────────────
    // The complete response body from the Python FastAPI service, kept for
    // debugging and future feature flags without re-running the pipeline.
    rawResult: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    // ── SAR Audit Trail ───────────────────────────────────────────────────────
    sarDrafts: [
      {
        text: String,
        generatedAt: Date,
      }
    ],
    
    sarAuditLog: [
      {
        requestedBy: { type: String, default: "analyst" },
        promptSent: String,
        draftReturned: String,
        timestamp: { type: Date, default: Date.now },
      }
    ],

    // ── Metadata ──────────────────────────────────────────────────────────────
    timestamp: {
      type: Date,
      default: Date.now,
    },
  },
  {
    // Automatically adds `createdAt` and `updatedAt` fields
    timestamps: true,
  }
);

// Compound index: fast lookup by CRN sorted newest-first (used for cache check
// and history queries)
InvestigationSchema.index({ crn: 1, timestamp: -1 });

module.exports = mongoose.model("Investigation", InvestigationSchema);
