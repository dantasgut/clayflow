// Nós de conjunto (spec 031, R10): índice linear de uma invocação nos despachos de conjunto — grupos de SCAN_GROUP
// (256), divididos em x/y como `Dispatcher.invocations` e como os argumentos indiretos dos registros `SetCount` — e o
// hash levado a [0, 1).
// Requer: SCAN_GROUP.

fn set_invocation(gid: vec3u, nwg: vec3u) -> u32 {
    return gid.x + gid.y * nwg.x * SCAN_GROUP;
}

// Os 24 bits altos do hash em [0, 1): exato em f32, a referência da CPU obtém o mesmo valor.
fn set_hash_unit(h: u32) -> f32 {
    return f32(h >> 8u) / 16777216.0;
}
