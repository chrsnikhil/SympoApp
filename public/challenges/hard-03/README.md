# The Auditor's Ledger

**Category:** Reverse Engineering / Memory Forensics
**Difficulty:** Hard (400 pts)
**Platform:** Windows x64

## Story

A rogue financial auditor working inside the Spider Society has been quietly
moving encrypted evidence across dimensions. Field agents recovered a small
Windows utility they used to verify each transfer — `ledger.exe`. Every
attempt to run it produces the same terse output:

    Verification Failed.

We suspect the real flag is never printed. Fortunately, a memory dump
(`ledger.dmp`) was captured while the process was still holding the
decrypted material in RAM.

Recover the flag.

## Provided Files

| File          | Purpose                                                |
| ------------- | ------------------------------------------------------ |
| `ledger.exe`  | Windows x64 binary (MSVC build)                        |
| `ledger.dmp`  | Full user-mode MiniDump captured during execution      |
| `README.md`   | This file                                              |

## Flag Format

    SPIDER{...}
