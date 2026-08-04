#include "antidebug.h"

#include <windows.h>
#include <intrin.h>

namespace antidebug {

// PEB->BeingDebugged direct read (x64 GS-based).
static bool peb_being_debugged() {
#if defined(_M_X64)
    // PEB at GS:[0x60], BeingDebugged at PEB+0x2
    unsigned char* peb = reinterpret_cast<unsigned char*>(__readgsqword(0x60));
    return peb[2] != 0;
#else
    return false;
#endif
}

// OutputDebugString trick — under a debugger, GetLastError is NOT set
// to zero by OutputDebugStringA.
static bool ods_trick() {
    SetLastError(0);
    OutputDebugStringA("");
    return GetLastError() != 0;
}

// Hardware breakpoint detection via DR0..DR3.
static bool hw_breakpoints() {
    CONTEXT ctx = {};
    ctx.ContextFlags = CONTEXT_DEBUG_REGISTERS;
    if (!GetThreadContext(GetCurrentThread(), &ctx)) return false;
    return ctx.Dr0 || ctx.Dr1 || ctx.Dr2 || ctx.Dr3;
}

// Timing check — a step-through debugger inflates RDTSC deltas hugely.
static bool timing_anomaly() {
    unsigned int aux = 0;
    unsigned __int64 t1 = __rdtscp(&aux);
    for (volatile int i = 0; i < 1000; i++) { /* nop loop */ }
    unsigned __int64 t2 = __rdtscp(&aux);
    return (t2 - t1) > 5'000'000ULL;
}

uint64_t detect_and_skew() {
    uint64_t skew = 0;
    if (IsDebuggerPresent())   skew ^= 0xA1B2C3D4E5F60718ULL;
    if (peb_being_debugged())  skew ^= 0x0F1E2D3C4B5A6978ULL;
    if (ods_trick())           skew ^= 0xDEADBEEFCAFEBABEULL;
    if (hw_breakpoints())      skew ^= 0x0123456789ABCDEFULL;
    if (timing_anomaly())      skew ^= 0xFEDCBA9876543210ULL;
    return skew;
}

} // namespace antidebug
