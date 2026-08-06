#pragma once
#include <cstdint>
#include <string>
#include <vector>

namespace utils {

// CRC32 (IEEE 802.3, poly 0xEDB88320).
uint32_t crc32(const void* data, size_t len);
uint32_t crc32(const std::string& s);

// Hex helpers.
std::string to_hex(const uint8_t* data, size_t len);
std::vector<uint8_t> from_hex(const std::string& hex);

// Base85 (RFC 1924 / Python base64.b85 alphabet). Decode-only is used here.
std::vector<uint8_t> b85_decode(const std::vector<uint8_t>& in);

// Volatile memory wipe — not elided by the optimizer.
void secure_zero(void* p, size_t n);

// XOR-obfuscated timestamp used as part of the runtime seed. Reads the
// current time and returns  (time ^ 0xC0DECAFE55AAFF01ULL).
uint64_t xor_obfuscated_timestamp();

// Machine hash from ComputerName + Volume Serial + CPU vendor bytes.
uint64_t machine_hash();

} // namespace utils
