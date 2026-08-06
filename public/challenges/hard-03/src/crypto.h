#pragma once
#include <cstdint>
#include <vector>

namespace crypto {

// SHA-1 via BCrypt. Returns 20-byte digest.
std::vector<uint8_t> sha1(const uint8_t* data, size_t len);

// SHA-256 via BCrypt. Returns 32-byte digest.
std::vector<uint8_t> sha256(const uint8_t* data, size_t len);

// AES-256-CBC decrypt using PKCS7 padding. Returns unpadded plaintext.
std::vector<uint8_t> aes256_cbc_decrypt(const uint8_t* key32,
                                        const uint8_t* iv16,
                                        const uint8_t* ct, size_t ct_len);

// ChaCha20 stream cipher (IETF variant, 96-bit nonce, 32-bit counter).
void chacha20(const uint8_t key32[32], const uint8_t nonce12[12],
              uint32_t counter,
              const uint8_t* in, uint8_t* out, size_t len);

// Reconstruct the last 8 bytes of the AES-256 key from SHA256(seed)
// picking bytes at g_tail_indices. MUST match the Python encrypt step.
void reconstruct_tail(uint64_t seed, uint8_t out[8]);

} // namespace crypto
