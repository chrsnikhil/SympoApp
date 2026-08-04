#pragma once
#include <cstdint>

namespace antidebug {

// Runs the full anti-debug battery and returns a 64-bit skew value.
//
// The trick: this function NEVER terminates the process. Instead it
// returns 0 when no debugger is detected, and a non-zero pseudo-random
// value when tampering is suspected. Callers XOR this value into the
// runtime seed, which silently corrupts every downstream key without
// tipping the operator off.
uint64_t detect_and_skew();

} // namespace antidebug
