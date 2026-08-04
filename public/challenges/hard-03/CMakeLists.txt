cmake_minimum_required(VERSION 3.20)
project(ledger CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

if(NOT MSVC)
    message(FATAL_ERROR "This challenge is built with MSVC only.")
endif()

add_compile_options(/W3 /GS- /Gy /O2 /Zi /EHsc)
add_link_options(/DEBUG /INCREMENTAL:NO /OPT:REF /OPT:ICF)

add_executable(ledger
    src/main.cpp
    src/loader.cpp
    src/crypto.cpp
    src/memory.cpp
    src/antidebug.cpp
    src/obfuscation.cpp
    src/utils.cpp
)

target_include_directories(ledger PRIVATE src)
target_link_libraries(ledger PRIVATE bcrypt dbghelp advapi32)

set_target_properties(ledger PROPERTIES
    OUTPUT_NAME "ledger"
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/bin"
)
