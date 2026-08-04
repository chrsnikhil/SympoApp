#include "obfuscation.h"

#include <windows.h>

#include <cstring>

namespace obf {

XorString::XorString(const char* enc, size_t len, uint8_t key) {
    decoded_.resize(len);
    for (size_t i = 0; i < len; i++)
        decoded_[i] = static_cast<char>(enc[i] ^ key);
}

bool opaque_true(uint64_t x) {
    // ((x * x) - x) is always even → LSB is 0 → the expression below
    // is always true. The compiler cannot prove it without value-range
    // analysis on arbitrary inputs.
    uint64_t y = x * x - x;
    return ((y & 1) == 0);
}

uint32_t rol13_hash(const char* s) {
    uint32_t h = 0;
    while (*s) {
        h = (h >> 13) | (h << 19);
        h += static_cast<uint8_t>(*s++);
    }
    return h;
}

AnyFn resolve_api(const char* module, uint32_t name_hash) {
    HMODULE mod = GetModuleHandleA(module);
    if (!mod) mod = LoadLibraryA(module);
    if (!mod) return nullptr;

    auto base = reinterpret_cast<uint8_t*>(mod);
    auto dos = reinterpret_cast<IMAGE_DOS_HEADER*>(base);
    auto nt = reinterpret_cast<IMAGE_NT_HEADERS*>(base + dos->e_lfanew);
    auto exp_rva = nt->OptionalHeader.DataDirectory[IMAGE_DIRECTORY_ENTRY_EXPORT].VirtualAddress;
    if (!exp_rva) return nullptr;

    auto exp = reinterpret_cast<IMAGE_EXPORT_DIRECTORY*>(base + exp_rva);
    auto names = reinterpret_cast<uint32_t*>(base + exp->AddressOfNames);
    auto ords  = reinterpret_cast<uint16_t*>(base + exp->AddressOfNameOrdinals);
    auto funcs = reinterpret_cast<uint32_t*>(base + exp->AddressOfFunctions);

    for (DWORD i = 0; i < exp->NumberOfNames; i++) {
        const char* n = reinterpret_cast<const char*>(base + names[i]);
        if (rol13_hash(n) == name_hash) {
            return reinterpret_cast<AnyFn>(base + funcs[ords[i]]);
        }
    }
    return nullptr;
}

} // namespace obf
