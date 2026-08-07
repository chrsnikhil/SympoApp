/**
 * Caesar Cipher Utilities
 * 
 * SECURITY NOTE: caesarEncrypt and caesarDecrypt should ONLY be used
 * in server-side code (API routes, seed scripts). The client only
 * needs applyShiftToLetter for preview purposes.
 */

/**
 * Encrypt a plaintext string using Caesar cipher with the given shift.
 * Only affects uppercase A-Z characters. Wraps after Z back to A.
 */
export function caesarEncrypt(text: string, shift: number): string {
  return text
    .toUpperCase()
    .split('')
    .map((char) => {
      if (char >= 'A' && char <= 'Z') {
        const code = char.charCodeAt(0);
        // Normalize shift to 0-25 range
        const normalizedShift = ((shift % 26) + 26) % 26;
        const shifted = ((code - 65 + normalizedShift) % 26) + 65;
        return String.fromCharCode(shifted);
      }
      return char;
    })
    .join('');
}

/**
 * Decrypt a ciphertext string using Caesar cipher with the given shift.
 * Reverse of caesarEncrypt.
 */
export function caesarDecrypt(text: string, shift: number): string {
  return caesarEncrypt(text, -shift);
}

/**
 * Apply a shift value to a single encrypted letter to produce a guessed letter.
 * This is safe for client-side use — it just does alphabet math on the
 * encrypted letter using the user's GUESSED shift value (not the real key).
 *
 * The shift here represents the user's guess for how many positions to shift back.
 */
export function applyShiftToLetter(encryptedLetter: string, guessedShift: number): string {
  const char = encryptedLetter.toUpperCase();
  if (char >= 'A' && char <= 'Z') {
    const code = char.charCodeAt(0);
    // Shift backwards (decrypt direction)
    const normalizedShift = ((guessedShift % 26) + 26) % 26;
    const shifted = ((code - 65 - normalizedShift + 26) % 26) + 65;
    return String.fromCharCode(shifted);
  }
  return char;
}
