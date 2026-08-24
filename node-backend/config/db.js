// config/db.js
// ─────────────────────────────────────────────────────────────────────────────
// Mongoose connection utility.
// Call connectDB() once at server startup; the connection is shared across all
// Mongoose models throughout the application's lifetime.
// ─────────────────────────────────────────────────────────────────────────────

const mongoose = require("mongoose");

/**
 * Connects to MongoDB Atlas using the MONGO_URI environment variable.
 * Exits the process on failure so the server never starts in a broken state.
 */
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options are the recommended defaults for Mongoose 8+
      serverSelectionTimeoutMS: 5000,  // Fail fast if Atlas is unreachable
    });

    console.log(`✅  MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    console.error(`❌  MongoDB connection error: ${err.message}`);
    // Hard exit — no point running an API with no database
    process.exit(1);
  }
};

module.exports = connectDB;
