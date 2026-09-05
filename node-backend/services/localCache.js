// services/localCache.js
// ─────────────────────────────────────────────────────────────────────────────
// Lightweight disk-based cache for investigation results.
// Stores one JSON file per CRN under node-backend/.cache/
// Used as an instant fallback when MongoDB Atlas is unreachable.
//
// Cache policy: results are valid for 24 hours (same-day, like the DB cache).
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require('fs')
const path = require('path')

const CACHE_DIR = path.join(__dirname, '..', '.cache')
const TTL_MS    = 24 * 60 * 60 * 1000  // 24 hours

// Ensure the cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
}

/**
 * Returns the file path for a given CRN.
 * @param {string} crn  Normalised (uppercase) CRN
 */
function cacheFilePath(crn) {
  // Sanitise CRN for safe filename usage
  const safe = crn.replace(/[^A-Z0-9]/g, '_')
  return path.join(CACHE_DIR, `${safe}.json`)
}

/**
 * Read a cached investigation result for a CRN.
 * Returns the stored payload if it exists and is younger than TTL_MS,
 * otherwise returns null.
 *
 * @param {string} crn
 * @returns {object|null}
 */
function get(crn) {
  const filePath = cacheFilePath(crn)
  if (!fs.existsSync(filePath)) return null

  try {
    const raw     = fs.readFileSync(filePath, 'utf8')
    const entry   = JSON.parse(raw)
    const ageMs   = Date.now() - entry._cachedAt

    if (ageMs > TTL_MS) {
      fs.unlinkSync(filePath)   // Expired — delete it
      return null
    }

    console.log(`[LOCAL CACHE HIT] CRN ${crn} — age ${Math.round(ageMs / 1000)}s`)
    return entry.data
  } catch (err) {
    console.warn(`[LOCAL CACHE READ ERROR] CRN ${crn}: ${err.message}`)
    return null
  }
}

/**
 * Write an investigation result to the local cache.
 *
 * @param {string} crn
 * @param {object} data  The raw AI result payload to store
 */
function set(crn, data) {
  const filePath = cacheFilePath(crn)
  const entry = {
    _cachedAt: Date.now(),
    data,
  }
  try {
    fs.writeFileSync(filePath, JSON.stringify(entry), 'utf8')
    console.log(`[LOCAL CACHE SET] CRN ${crn} — written to ${filePath}`)
  } catch (err) {
    console.warn(`[LOCAL CACHE WRITE ERROR] ${err.message}`)
  }
}

/**
 * Delete the cached entry for a CRN (e.g. to force a fresh investigation).
 * @param {string} crn
 */
function invalidate(crn) {
  const filePath = cacheFilePath(crn)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
    console.log(`[LOCAL CACHE INVALIDATED] CRN ${crn}`)
  }
}

module.exports = { get, set, invalidate }
