// The Auditor's Ledger — Windows x64 CTF challenge.
//
// This binary always prints "Verification Failed." — regardless of
// input. The real flag is only ever briefly resident in memory. A
// memory dump captured during execution (ledger.dmp) is shipped
// alongside the binary so it can be recovered offline.
//
// See loader.cpp for the runtime pipeline.

#include "loader.h"

#include <cstdio>
#include <string>

int main(int argc, char** argv) {
    std::string username = (argc > 1) ? argv[1] : "auditor";
    loader::run(username);
    return 0;
}
