#include "memory.h"

#include <windows.h>
#include <dbghelp.h>

#include <cstdlib>
#include <string>

#pragma comment(lib, "dbghelp.lib")

namespace mem {

static std::string exe_dir() {
    char buf[MAX_PATH] = {};
    GetModuleFileNameA(nullptr, buf, sizeof(buf));
    std::string p(buf);
    auto pos = p.find_last_of("\\/");
    return pos == std::string::npos ? std::string(".") : p.substr(0, pos);
}

void maybe_write_dump() {
    char* v = nullptr;
    size_t sz = 0;
    _dupenv_s(&v, &sz, "LEDGER_DUMP");
    bool enabled = (v && sz && v[0] == '1');
    free(v);
    if (!enabled) return;

    std::string path = exe_dir() + "\\ledger.dmp";
    HANDLE f = CreateFileA(path.c_str(), GENERIC_WRITE, 0, nullptr,
                           CREATE_ALWAYS, FILE_ATTRIBUTE_NORMAL, nullptr);
    if (f == INVALID_HANDLE_VALUE) return;

    MINIDUMP_TYPE type = static_cast<MINIDUMP_TYPE>(
        MiniDumpWithFullMemory |
        MiniDumpWithHandleData |
        MiniDumpWithThreadInfo |
        MiniDumpWithProcessThreadData);

    MiniDumpWriteDump(GetCurrentProcess(), GetCurrentProcessId(),
                      f, type, nullptr, nullptr, nullptr);
    CloseHandle(f);
}

} // namespace mem
