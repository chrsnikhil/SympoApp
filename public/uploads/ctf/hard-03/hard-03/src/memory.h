#pragma once

namespace mem {

// Writes a full user-mode MiniDump of the current process to
// "ledger.dmp" next to the executable, gated on the LEDGER_DUMP env var.
// Called by the loader at the exact moment where partial key material,
// IV, and round keys are on the stack but the ChaCha20 plaintext has
// already been wiped.
void maybe_write_dump();

} // namespace mem
