// Slots vivos de um pool (spec 008, R2): a C2 mantém um bit por slot ocupado em `array<u32>` (pool `<chave>.live`).
// Kernels que percorrem `[0, count)` de um pool testam o bit para ignorar slots livres (faixas liberadas).

fn pool_live(word: u32, slot: u32) -> bool {
    return ((word >> (slot & 31u)) & 1u) == 1u;
}
