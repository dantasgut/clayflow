// Spec 004 (R19) — estado da lista compactada de contatos, da tabela de warm start e das somas por corpo do LCP.

// Contador da lista compactada: `count` reserva índices na narrowphase; `overflow` conta contatos acima da capacidade.
struct RBContactCounter {
    count:    atomic<u32>,
    overflow: atomic<u32>,
    _pad0:    u32,
    _pad1:    u32,
}

// Entrada da tabela de warm start: impulsos do contato `key - 1` (= par × 8 + feature, módulo 2^32).
// A tabela tem duas regiões de `warm_capacity` entradas, alternadas pela paridade de `contact_stamp`: o substep lê a
// região do anterior e grava a sua (zerada no fluxo de comandos antes da gravação).
struct RBWarmEntry {
    key:       atomic<u32>,  // 0 = vazia
    lambda_n:  f32,
    lambda_tx: f32,
    lambda_ty: f32,
}

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

struct RBBodyDelta {
    dv_x: atomic<i32>,
    dv_y: atomic<i32>,
    dv_z: atomic<i32>,
    _pad0: i32,
    dw_x: atomic<i32>,
    dw_y: atomic<i32>,
    dw_z: atomic<i32>,
    _pad1: i32,
}

// Correção posicional acumulada por corpo (ponto fixo) e contatos do corpo no último substep do passo.
struct RBBodyCorrection {
    c_x:      atomic<i32>,
    c_y:      atomic<i32>,
    c_z:      atomic<i32>,
    contacts: atomic<i32>,
}
