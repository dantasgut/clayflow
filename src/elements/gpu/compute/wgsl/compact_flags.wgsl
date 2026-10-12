// Compactação estável (Compaction, research R10), passo 1: flag 0/1 do predicado por elemento — a soma de prefixos
// exclusiva das flags dá a posição de cada aceito na saída, na ordem da entrada.
@group(0) @binding(0) var<uniform>             compact:       CompactParams;
@group(0) @binding(1) var<storage, read_write> compact_flags: array<u32>;

@compute @workgroup_size(256)
fn compact_flags_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    if (i >= compact.count) { return; }
    compact_flags[i] = select(0u, 1u, compact_keep(i));
}
