// Spec 004 (R19) — estado da lista compactada de contatos e tabela de warm start do LCP.

// Contador da lista compactada: `count` reserva índices na narrowphase; `overflow` conta contatos acima da capacidade.
struct RBContactCounter {
    count:    atomic<u32>,
    overflow: atomic<u32>,
    _pad0:    u32,
    _pad1:    u32,
}

// Entrada da tabela de warm start: impulsos do par `key - 1` gravados no substep `stamp`.
struct RBWarmEntry {
    key:       u32,   // id do par + 1 (0 = vazio)
    stamp:     u32,   // substep em que foi gravada
    lambda_n:  f32,
    lambda_tx: f32,
    lambda_ty: f32,
    _pad0:     f32,
    _pad1:     f32,
    _pad2:     f32,
}

// Sondagem linear limitada: sem entrada em até RB_WARM_PROBES slots, o par começa sem warm start.
const RB_WARM_PROBES: u32 = 32u;

// Slot inicial do par na tabela (capacidade potência de 2).
fn rb_warm_home(key: u32, capacity: u32) -> u32 {
    return (key * 2654435761u) & (capacity - 1u);
}
