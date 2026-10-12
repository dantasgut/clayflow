// Estado dos contatos do LCP (spec 004, R19): chaves e regiões da tabela de warm start e ponto fixo das somas por
// corpo. Os structs (`RBContactCounter`, `RBWarmEntry`, `RBBodyDelta`, `RBBodyCorrection`) são gerados dos schemas.

// Sondagem linear limitada: sem entrada em até RB_WARM_PROBES slots, o contato começa sem warm start.
const RB_WARM_PROBES: u32 = 32u;

// Chave do contato (par, feature) na tabela; 0 é reservado para vazia.
fn rb_warm_key(pair: u32, feature: u32) -> u32 {
    return pair * 8u + feature + 1u;
}

// Slot inicial da chave numa região (capacidade potência de 2).
fn rb_warm_home(key: u32, capacity: u32) -> u32 {
    return (key * 2654435761u) & (capacity - 1u);
}

// Início da região da tabela do substep com o carimbo dado.
fn rb_warm_region(stamp: u32, capacity: u32) -> u32 {
    return (stamp & 1u) * capacity;
}

// Somas por corpo em ponto fixo (atomics inteiros — WGSL não tem atomics de f32). Δv e Δω de cada contato
// (solver Jacobi com divisão de massa) e correção posicional (xyz) + contatos (w) por corpo.
const RB_FIXED_SCALE: f32 = 1048576.0;   // 2^20: resolução ~1e-6, faixa ±2048
const RB_FIXED_LIMIT: f32 = 2000.0;

fn rb_to_fixed(v: f32) -> i32 {
    return i32(round(clamp(v, -RB_FIXED_LIMIT, RB_FIXED_LIMIT) * RB_FIXED_SCALE));
}

fn rb_from_fixed(v: i32) -> f32 {
    return f32(v) / RB_FIXED_SCALE;
}
