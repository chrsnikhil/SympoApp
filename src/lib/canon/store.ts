/**
 * Shared in-memory token store for Canon Protocol challenge.
 * Manages short-lived temporary tokens for race condition / fast TTL stage.
 */

export interface TempToken {
  token: string;
  createdAt: number;
  redeemed: boolean;
}

// In-memory token storage (2-second TTL)
const tempTokens = new Map<string, TempToken>();

export const TTL_MS = 30000; //need to change to 2000 ms after testing

export function createTempToken(): string {
  const token = `temp_tok_${Math.random().toString(36).substring(2, 10)}${Date.now().toString(36)}`;
  tempTokens.set(token, {
    token,
    createdAt: Date.now(),
    redeemed: false,
  });

  // Cleanup old tokens after 10 seconds
  setTimeout(() => {
    tempTokens.delete(token);
  }, 10000);

  return token;
}

export function validateAndRedeemTempToken(token: string): { ok: boolean; reason?: string } {
  const item = tempTokens.get(token);
  if (!item) {
    return { ok: false, reason: "Invalid session token" };
  }

  if (item.redeemed) {
    return { ok: false, reason: "Token already consumed" };
  }

  const elapsed = Date.now() - item.createdAt;
  if (elapsed > TTL_MS) {
    return { ok: false, reason: "Session expired (TTL 2000ms exceeded)" };
  }

  item.redeemed = true;
  return { ok: true };
}
