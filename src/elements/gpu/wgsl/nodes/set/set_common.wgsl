// Nós de conjunto (spec 031, R10): índice linear de uma invocação nos despachos de conjunto — grupos de SCAN_GROUP
// (256), divididos em x/y como `Dispatcher.invocations` e como os argumentos indiretos dos registros `SetCount`.
// Requer: SCAN_GROUP.

fn set_invocation(gid: vec3u, nwg: vec3u) -> u32 {
    return gid.x + gid.y * nwg.x * SCAN_GROUP;
}
