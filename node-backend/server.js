// server.js
// ─────────────────────────────────────────────────────────────────────────────
// Entry point for the Node.js/Express middleware layer.
//
// Responsibilities:
//  • Connect to MongoDB Atlas on startup
//  • Mount CORS (allow Vite dev server at localhost:5173)
//  • Mount /api routes
//  • Expose a /health endpoint
//  • Listen on PORT (default 5000)
// ─────────────────────────────────────────────────────────────────────────────

require("dotenv").config();   // Load .env before anything else

const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const investigateRoutes = require("./routes/investigate");

const app = express();
const PORT = process.env.PORT || 5000;

// ── Connect to MongoDB Atlas ──────────────────────────────────────────────────
connectDB();

// ── Middleware ────────────────────────────────────────────────────────────────

// CORS — allow the Vite dev server and any localhost variant
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:5174",
      "http://127.0.0.1:5173",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Parse JSON request bodies (needed for POST /api/investigate)
app.use(express.json({ limit: "10mb" }));

// Parse URL-encoded bodies (for multipart workaround if needed)
app.use(express.urlencoded({ extended: true }));

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "ok",
    service: "unshell-node-backend",
    version: "1.0.0",
    aiServiceURL: process.env.AI_SERVICE_URL || "http://localhost:8001",
    timestamp: new Date().toISOString(),
  });
});

// ── API routes ────────────────────────────────────────────────────────────────
// All investigation & history endpoints live under /api
app.use("/api", investigateRoutes);

// ── 404 fallback ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

// ── Global error handler ──────────────────────────────────────────────────────
// Catches any error passed via next(err) in route handlers
app.use((err, req, res, _next) => {
  console.error("[Global Error Handler]", err);
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
    type: err.name || "Error",
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀  Node middleware running on http://localhost:${PORT}`);
  console.log(`🤖  AI service proxy → ${process.env.AI_SERVICE_URL || "http://localhost:8001"}`);
});
