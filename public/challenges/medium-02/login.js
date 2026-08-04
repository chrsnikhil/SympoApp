/*
 * Spider Society — Authentication Portal
 * Internal build. Do not distribute.
 *
 * TODO(dev): move OTP generation server-side before shipping.
 */

// Shared authentication secret (base64 for "safety")
const SECRET = "U1BJREVSX1NPQ0lFVFlfMjAyNg==";

/**
 * Generate the current 6-digit OTP.
 * A new OTP is issued every 30 seconds.
 *
 *   window = floor(Date.now() / 30000)
 *   otp    = last 6 digits of SHA256(atob(SECRET) + window)
 */
async function generateOtp() {
  const decoded = atob(SECRET);
  const currentWindow = Math.floor(Date.now() / 30000);
  const message = decoded + currentWindow;

  const buf = new TextEncoder().encode(message);
  const hashBuf = await crypto.subtle.digest("SHA-256", buf);
  const hex = Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Last 6 hex characters → interpret as decimal, pad to 6 digits
  const tail = hex.slice(-6);
  const otp = (parseInt(tail, 16) % 1000000).toString().padStart(6, "0");
  return otp;
}

// Expose for the login page
window.__SpiderAuth = { SECRET, generateOtp };
