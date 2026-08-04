"""Generate random keys used by the Auditor's Ledger build.

Outputs scripts/keys.json — consumed by encrypt_assets.py. Regenerated
every build so no two shipped binaries share the same key material.
"""
import json
import os
import secrets
from pathlib import Path

HERE = Path(__file__).resolve().parent
OUT = HERE / "keys.json"


def main() -> None:
    payload = {
        # 32-byte AES-256 key. First 24 bytes end up embedded (obfuscated)
        # in the binary; the last 8 bytes are reconstructed at runtime from
        # SHA256(seed) bytes {3,7,12,18,23,29,30,31}.
        "aes_key": secrets.token_hex(32),
        # 16-byte IV
        "aes_iv": secrets.token_hex(16),
        # ChaCha20 key and nonce are re-derived at runtime from the AES
        # plaintext; the shipped binary only stores the nonce so that the
        # key must be recomputed from decrypted state.
        "chacha_nonce": secrets.token_hex(12),
        # Flag never appears in the binary.
        "flag": "SPIDER{aud1t0r_mem0ry_never_l13s}",
    }
    OUT.write_text(json.dumps(payload, indent=2))
    print(f"wrote {OUT}  ({os.path.getsize(OUT)} bytes)")


if __name__ == "__main__":
    main()
