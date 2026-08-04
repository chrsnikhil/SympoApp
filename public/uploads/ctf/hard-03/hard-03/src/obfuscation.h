#pragma once
#include <cstdint>
#include <string>

namespace obf {

// Compile-time XOR string encryption. Strings are stored in .rdata as
// XORed bytes and decoded on first access.
class XorString {
public:
    XorString(const char* enc, size_t len, uint8_t key);
    const std::string& get() const { return decoded_; }
private:
    std::string decoded_;
};

// Opaque predicate — always true, but the optimizer can't prove it.
// Used to keep dead-code paths that reference decoy artefacts in the
// binary without ever executing them.
bool opaque_true(uint64_t x);

// API hashing — resolve a Win32 API by its 32-bit ROL13 name hash
// without ever mentioning the API name in the binary.
using AnyFn = void*;
AnyFn resolve_api(const char* module, uint32_t name_hash);
uint32_t rol13_hash(const char* s);

} // namespace obf

// Handy macro for XOR-encrypted literals. Encryption is *runtime* here
// (the bytes are in .rdata plaintext then decoded on first use); a real
// build would use consteval to encrypt at compile time.
#define OBF_STR(literal, key)                                                  \
    ([](){                                                                     \
        static const char raw_[] = literal;                                    \
        static char enc_[sizeof(raw_)];                                        \
        for (size_t i = 0; i < sizeof(raw_); ++i) enc_[i] = raw_[i] ^ (key);   \
        static obf::XorString s(enc_, sizeof(raw_) - 1, (key));                \
        return s.get();                                                        \
    }())
