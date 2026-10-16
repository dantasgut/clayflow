// Nós de conjunto com contagem da GPU por compactação (spec 031, R10): o total aceito (`AtomicAllocCounter.count`)
// vira a contagem do registro `SetCount` do conjunto de saída, presa na capacidade — sem leitura de volta.
// Requer: set_accepted_params, set_accepted, set_counts (leitura e escrita).

@compute @workgroup_size(1)
fn set_accepted_main() {
    let total = atomicLoad(&set_accepted.count);
    set_counts[set_accepted_params.slot].count = min(total, set_accepted_params.capacity);
}
