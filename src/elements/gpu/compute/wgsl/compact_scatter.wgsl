// Compactação estável (Compaction, research R10), passo 2: cada aceito vai para a posição dada pela soma de prefixos
// das flags; o último elemento grava a contagem total e o excedente acima de `compact.capacity`.
@group(0) @binding(0) var<uniform>             compact:           CompactParams;
@group(0) @binding(1) var<storage, read_write> compact_out:       array<u32>;
@group(0) @binding(2) var<storage, read_write> compact_counter:   AtomicAllocCounter;
@group(0) @binding(3) var<storage, read>       compact_positions: array<u32>;

@compute @workgroup_size(256)
fn compact_scatter_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    let n = compact.count;
    if (i >= n) { return; }
    let keep = compact_keep(i);
    let pos  = compact_positions[i];
    if (i == n - 1u) {
        let total = pos + select(0u, 1u, keep);
        atomicStore(&compact_counter.count, total);
        atomicStore(&compact_counter.overflow, total - min(total, compact.capacity));
    }
    if (keep && pos < compact.capacity) { compact_out[pos] = compact_value(i); }
}
