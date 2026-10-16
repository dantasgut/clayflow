// Compactação por alocação atômica (Compaction, research R10): cada elemento aceito pelo predicado do consumidor
// (`compact_keep`, `compact_value`) recebe uma posição de `atomic_alloc`. Ordem da saída não garantida; o excedente
// é contado no contador e nada é escrito além de `compact.capacity`.

@compute @workgroup_size(256)
fn compact_atomic_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let i = gid3.x + gid3.y * nwg.x * 256u;
    if (i >= compact_count() || !compact_keep(i)) { return; }
    let k = atomic_alloc(&compact_counter, compact.capacity);
    if (k == ATOMIC_ALLOC_FULL) { return; }
    compact_out[k] = compact_value(i);
}
