#pragma once
#include <cstdint>
#include <string>

namespace loader {

// Full runtime pipeline:
//   1. Compute seed = CRC32(username) ^ obfuscated_ts ^ machine_hash
//      XOR-ed with the anti-debug skew (silent corruption under debug).
//   2. Rebuild AES-256 key: XOR-decrypt head 24B + reconstruct tail 8B
//      via SHA256(seed).
//   3. AES-256-CBC decrypt the embedded ciphertext.
//   4. Base85-decode the plaintext → JSON.
//   5. Extract nonce + hex flag ciphertext from JSON.
//   6. Derive ChaCha20 key = SHA1(aes_plaintext) padded to 32 bytes.
//   7. ChaCha20-decrypt → the flag.
//
// The loader intentionally never prints the flag; only "Verification
// Failed." is printed. The flag is briefly held in memory (long enough
// for MiniDumpWriteDump to capture partial key state) then wiped.
void run(const std::string& username);

} // namespace loader
