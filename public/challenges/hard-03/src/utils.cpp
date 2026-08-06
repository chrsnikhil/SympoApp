#include "utils.h"

#include <windows.h>
#include <intrin.h>

#include <array>
#include <chrono>
#include <cstring>

namespace utils {

// ── CRC32 ────────────────────────────────────────────────────────────
static uint32_t g_crc_table[256];
static bool g_crc_ready = false;

static void init_crc_table() {
    for (uint32_t i = 0; i < 256; i++) {
        uint32_t c = i;
        for (int k = 0; k < 8; k++) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1;
        g_crc_table[i] = c;
    }
    g_crc_ready = true;
}

uint32_t crc32(const void* data, size_t len) {
    if (!g_crc_ready) init_crc_table();
    const uint8_t* p = static_cast<const uint8_t*>(data);
    uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < len; i++) c = g_crc_table[(c ^ p[i]) & 0xFF] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

uint32_t crc32(const std::string& s) { return crc32(s.data(), s.size()); }

// ── Hex helpers ──────────────────────────────────────────────────────
std::string to_hex(const uint8_t* data, size_t len) {
    static const char* hex = "0123456789abcdef";
    std::string out;
    out.resize(len * 2);
    for (size_t i = 0; i < len; i++) {
        out[i * 2]     = hex[data[i] >> 4];
        out[i * 2 + 1] = hex[data[i] & 0xF];
    }
    return out;
}

std::vector<uint8_t> from_hex(const std::string& hex) {
    std::vector<uint8_t> out;
    out.reserve(hex.size() / 2);
    auto v = [](char c) -> int {
        if (c >= '0' && c <= '9') return c - '0';
        if (c >= 'a' && c <= 'f') return 10 + c - 'a';
        if (c >= 'A' && c <= 'F') return 10 + c - 'A';
        return 0;
    };
    for (size_t i = 0; i + 1 < hex.size(); i += 2)
        out.push_back(static_cast<uint8_t>((v(hex[i]) << 4) | v(hex[i + 1])));
    return out;
}

// ── Base85 decode (Python b85 alphabet) ──────────────────────────────
static const char* kB85 =
    "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~";

std::vector<uint8_t> b85_decode(const std::vector<uint8_t>& in) {
    std::array<int, 256> lut{};
    lut.fill(-1);
    for (int i = 0; i < 85; i++) lut[static_cast<uint8_t>(kB85[i])] = i;

    std::vector<uint8_t> out;
    out.reserve((in.size() * 4) / 5);
    size_t i = 0;
    while (i < in.size()) {
        int chunk = 0;
        int taken = 0;
        uint64_t acc = 0;
        while (taken < 5 && i < in.size()) {
            int v = lut[in[i++]];
            if (v < 0) continue;
            acc = acc * 85 + v;
            taken++;
        }
        if (taken == 0) break;
        // If fewer than 5 chars taken (last chunk), pad with 'high'
        int pad = 5 - taken;
        for (int k = 0; k < pad; k++) acc = acc * 85 + 84;
        uint8_t bytes[4];
        bytes[0] = static_cast<uint8_t>((acc >> 24) & 0xFF);
        bytes[1] = static_cast<uint8_t>((acc >> 16) & 0xFF);
        bytes[2] = static_cast<uint8_t>((acc >> 8) & 0xFF);
        bytes[3] = static_cast<uint8_t>(acc & 0xFF);
        int emit = 4 - pad;
        for (int k = 0; k < emit; k++) out.push_back(bytes[k]);
        chunk++;
    }
    return out;
}

// ── Secure zero ──────────────────────────────────────────────────────
void secure_zero(void* p, size_t n) {
    volatile uint8_t* v = static_cast<volatile uint8_t*>(p);
    while (n--) *v++ = 0;
}

// ── XOR-obfuscated timestamp ─────────────────────────────────────────
uint64_t xor_obfuscated_timestamp() {
    using namespace std::chrono;
    auto now = duration_cast<seconds>(system_clock::now().time_since_epoch()).count();
    return static_cast<uint64_t>(now) ^ 0xC0DECAFE55AAFF01ULL;
}

// ── Machine hash ─────────────────────────────────────────────────────
uint64_t machine_hash() {
    char name[256] = {};
    DWORD len = sizeof(name);
    GetComputerNameA(name, &len);

    DWORD serial = 0, maxlen = 0, flags = 0;
    char fs[32] = {};
    GetVolumeInformationA("C:\\", nullptr, 0, &serial, &maxlen, &flags, fs, sizeof(fs));

    int cpuid[4] = {};
    __cpuid(cpuid, 0);

    uint64_t h = 0xCBF29CE484222325ULL; // FNV-1a offset
    auto mix = [&](const void* data, size_t n) {
        const uint8_t* p = static_cast<const uint8_t*>(data);
        for (size_t i = 0; i < n; i++) {
            h ^= p[i];
            h *= 0x100000001B3ULL;
        }
    };
    mix(name, static_cast<size_t>(len));
    mix(&serial, sizeof(serial));
    mix(cpuid, sizeof(cpuid));
    return h;
}

} // namespace utils
