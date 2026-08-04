#include "crypto.h"
#include "generated_assets.h"

#include <windows.h>
#include <bcrypt.h>

#include <cstring>
#include <stdexcept>

#pragma comment(lib, "bcrypt.lib")

namespace crypto {

static std::vector<uint8_t> bcrypt_hash(LPCWSTR algid, const uint8_t* data, size_t len) {
    BCRYPT_ALG_HANDLE alg = nullptr;
    if (BCryptOpenAlgorithmProvider(&alg, algid, nullptr, 0) != 0) return {};
    DWORD hash_len = 0, cb = 0;
    BCryptGetProperty(alg, BCRYPT_HASH_LENGTH, reinterpret_cast<PUCHAR>(&hash_len),
                      sizeof(hash_len), &cb, 0);
    std::vector<uint8_t> out(hash_len);
    BCRYPT_HASH_HANDLE h = nullptr;
    BCryptCreateHash(alg, &h, nullptr, 0, nullptr, 0, 0);
    BCryptHashData(h, const_cast<PUCHAR>(data), static_cast<ULONG>(len), 0);
    BCryptFinishHash(h, out.data(), static_cast<ULONG>(out.size()), 0);
    BCryptDestroyHash(h);
    BCryptCloseAlgorithmProvider(alg, 0);
    return out;
}

std::vector<uint8_t> sha1(const uint8_t* data, size_t len) {
    return bcrypt_hash(BCRYPT_SHA1_ALGORITHM, data, len);
}

std::vector<uint8_t> sha256(const uint8_t* data, size_t len) {
    return bcrypt_hash(BCRYPT_SHA256_ALGORITHM, data, len);
}

std::vector<uint8_t> aes256_cbc_decrypt(const uint8_t* key32,
                                        const uint8_t* iv16,
                                        const uint8_t* ct, size_t ct_len) {
    BCRYPT_ALG_HANDLE alg = nullptr;
    BCryptOpenAlgorithmProvider(&alg, BCRYPT_AES_ALGORITHM, nullptr, 0);
    BCryptSetProperty(alg, BCRYPT_CHAINING_MODE,
                      reinterpret_cast<PUCHAR>(const_cast<wchar_t*>(BCRYPT_CHAIN_MODE_CBC)),
                      sizeof(BCRYPT_CHAIN_MODE_CBC), 0);
    BCRYPT_KEY_HANDLE key = nullptr;
    BCryptGenerateSymmetricKey(alg, &key, nullptr, 0,
                               const_cast<PUCHAR>(key32), 32, 0);
    std::vector<uint8_t> iv_copy(iv16, iv16 + 16);
    std::vector<uint8_t> pt(ct_len + 16);
    ULONG produced = 0;
    BCryptDecrypt(key, const_cast<PUCHAR>(ct), static_cast<ULONG>(ct_len),
                  nullptr, iv_copy.data(), 16,
                  pt.data(), static_cast<ULONG>(pt.size()),
                  &produced, BCRYPT_BLOCK_PADDING);
    pt.resize(produced);
    BCryptDestroyKey(key);
    BCryptCloseAlgorithmProvider(alg, 0);
    return pt;
}

// ── ChaCha20 (IETF) — small manual implementation ────────────────────
static inline uint32_t rotl32(uint32_t v, int n) { return (v << n) | (v >> (32 - n)); }

static void quarter(uint32_t& a, uint32_t& b, uint32_t& c, uint32_t& d) {
    a += b; d ^= a; d = rotl32(d, 16);
    c += d; b ^= c; b = rotl32(b, 12);
    a += b; d ^= a; d = rotl32(d, 8);
    c += d; b ^= c; b = rotl32(b, 7);
}

static void chacha_block(const uint32_t state[16], uint8_t out[64]) {
    uint32_t x[16];
    std::memcpy(x, state, sizeof(x));
    for (int i = 0; i < 10; i++) {
        quarter(x[0], x[4], x[8],  x[12]);
        quarter(x[1], x[5], x[9],  x[13]);
        quarter(x[2], x[6], x[10], x[14]);
        quarter(x[3], x[7], x[11], x[15]);
        quarter(x[0], x[5], x[10], x[15]);
        quarter(x[1], x[6], x[11], x[12]);
        quarter(x[2], x[7], x[8],  x[13]);
        quarter(x[3], x[4], x[9],  x[14]);
    }
    for (int i = 0; i < 16; i++) x[i] += state[i];
    std::memcpy(out, x, 64);
}

void chacha20(const uint8_t key32[32], const uint8_t nonce12[12],
              uint32_t counter,
              const uint8_t* in, uint8_t* out, size_t len) {
    uint32_t state[16];
    state[0] = 0x61707865; state[1] = 0x3320646e;
    state[2] = 0x79622d32; state[3] = 0x6b206574;
    std::memcpy(&state[4], key32, 32);
    state[12] = counter;
    std::memcpy(&state[13], nonce12, 12);

    uint8_t stream[64];
    while (len > 0) {
        chacha_block(state, stream);
        state[12]++;
        size_t take = len < 64 ? len : 64;
        for (size_t i = 0; i < take; i++) out[i] = in[i] ^ stream[i];
        in += take; out += take; len -= take;
    }
}

void reconstruct_tail(uint64_t seed, uint8_t out[8]) {
    auto h = sha256(reinterpret_cast<const uint8_t*>(&seed), sizeof(seed));
    for (int i = 0; i < 8; i++) out[i] = h[g_tail_indices[i]];
}

} // namespace crypto
