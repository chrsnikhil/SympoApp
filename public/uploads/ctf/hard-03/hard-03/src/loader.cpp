#include "loader.h"
#include "antidebug.h"
#include "crypto.h"
#include "generated_assets.h"
#include "memory.h"
#include "obfuscation.h"
#include "utils.h"

#include <windows.h>

#include <array>
#include <cstdio>
#include <cstring>
#include <string>
#include <vector>

namespace loader {

// Flattened control-flow dispatcher — every stage is a case in a state
// machine driven by an obfuscated "next" value, not straight-line calls.
enum Stage : int {
    S_SEED = 0x11, S_KEY = 0x22, S_AES = 0x33, S_B85 = 0x44,
    S_JSON = 0x55, S_KDF = 0x66, S_CHA = 0x77, S_END = 0x00
};

static std::string extract_json_field(const std::string& j, const std::string& key) {
    // Minimal JSON string-value extractor. Assumes {"key":"value",...}
    auto pos = j.find("\"" + key + "\"");
    if (pos == std::string::npos) return {};
    pos = j.find(':', pos);
    if (pos == std::string::npos) return {};
    pos = j.find('"', pos);
    if (pos == std::string::npos) return {};
    auto end = j.find('"', pos + 1);
    if (end == std::string::npos) return {};
    return j.substr(pos + 1, end - pos - 1);
}

void run(const std::string& username) {
    // Decoy references — keep the fake artefacts alive in .rdata via an
    // opaque-true guard so the optimizer cannot strip them.
    if (!obf::opaque_true(reinterpret_cast<uint64_t>(&username))) {
        std::printf("%s %s %s\n", g_decoy_flag_a, g_decoy_flag_b, g_decoy_json);
    }

    // ── Assemble runtime state (partial key material lives on stack) ──
    uint8_t aes_key[32] = {};
    uint8_t chacha_key[32] = {};
    std::vector<uint8_t> aes_pt, b85_pt, flag_pt;
    uint64_t seed = 0;

    int stage = S_SEED;
    while (stage != S_END) {
        switch (stage) {
        case S_SEED: {
            uint32_t user_crc = utils::crc32(username);
            uint64_t ts = utils::xor_obfuscated_timestamp();
            uint64_t mh = utils::machine_hash();
            seed = static_cast<uint64_t>(user_crc) ^ ts ^ mh;
            // Silent skew under debug — corrupts every downstream key.
            seed ^= antidebug::detect_and_skew();
            stage = S_KEY;
        } break;

        case S_KEY: {
            // XOR-decrypt first 24 bytes.
            for (int i = 0; i < 24; i++)
                aes_key[i] = g_key_head_obf[i] ^ g_key_head_mask[i % sizeof(g_key_head_mask)];
            // Reconstruct last 8 bytes from SHA256(seed).
            uint8_t tail[8];
            crypto::reconstruct_tail(seed, tail);
            std::memcpy(aes_key + 24, tail, 8);
            utils::secure_zero(tail, sizeof(tail));
            stage = S_AES;
        } break;

        case S_AES: {
            aes_pt = crypto::aes256_cbc_decrypt(aes_key, g_aes_iv,
                                                g_aes_ct, sizeof(g_aes_ct));
            stage = S_B85;
        } break;

        case S_B85: {
            b85_pt = utils::b85_decode(aes_pt);
            stage = S_JSON;
        } break;

        case S_JSON: {
            // Derive ChaCha20 key = SHA1(aes_pt) padded to 32 bytes.
            auto sha = crypto::sha1(aes_pt.data(), aes_pt.size());
            std::memcpy(chacha_key, sha.data(), sha.size());
            stage = S_KDF;
        } break;

        case S_KDF: {
            // Snapshot moment — round keys, IV, partial state present.
            // Dump here so the .dmp contains AES material but not yet
            // the ChaCha20 plaintext.
            mem::maybe_write_dump();
            stage = S_CHA;
        } break;

        case S_CHA: {
            std::string json(reinterpret_cast<const char*>(b85_pt.data()),
                             b85_pt.size());
            auto nonce   = utils::from_hex(extract_json_field(json, "nonce"));
            auto flag_ct = utils::from_hex(extract_json_field(json, "flag"));
            if (nonce.size() != 12 || flag_ct.empty()) {
                stage = S_END;
                break;
            }

            flag_pt.assign(flag_ct.size(), 0);
            crypto::chacha20(chacha_key, nonce.data(), 0,
                             flag_ct.data(), flag_pt.data(), flag_ct.size());

            // The binary NEVER prints the flag. It prints only failure.
            // The flag exists in `flag_pt` for a few microseconds before
            // being wiped.
            volatile uint8_t sink = 0;
            for (auto b : flag_pt) sink ^= b;
            (void)sink;

            utils::secure_zero(flag_pt.data(), flag_pt.size());
            stage = S_END;
        } break;

        default:
            stage = S_END;
        }
    }

    utils::secure_zero(aes_key, sizeof(aes_key));
    utils::secure_zero(chacha_key, sizeof(chacha_key));

    std::puts("Verification Failed.");
}

} // namespace loader
