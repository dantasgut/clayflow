// Função pronta do ponto `emit` (spec 009): as formas do emissor — ponto (posição e velocidade fixas), esfera
// (superfície do raio, velocidade radial) e cone (do vértice, dentro do meio-ângulo em torno da direção). Uma
// `EmitFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle
// `i` é o índice global da partícula no emissor (0, 1, 2… na ordem de criação), `time` o tempo simulado do passo. O
// carregador `emit_fn_params(slot)` lê o registro tipado da função no pool da forma dela (spec 031); a pronta não tem.
// Requer: struct EmitterParams; emit_point_types; o recurso `emit_params`.

struct EmitFnParams {
    _unused: u32,
}

fn emit_fn_params(slot: u32) -> EmitFnParams {
    return EmitFnParams(0u);
}

fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle {
    var p: EmittedParticle;
    p.life = emit_params.lifetime;
    p.color = vec4f(1.0);
    let a = emit_params.shape_a.xyz;
    let b = emit_params.shape_b.xyz;
    let s = emit_params.shape_s;
    switch emit_params.shape_kind {
        // Esfera: a = centro, s.x = raio, s.y = velocidade radial.
        case 1u: {
            let d = sample_sphere(vec2f(emit_rand(i, seed, 0u), emit_rand(i, seed, 1u))).xzy;
            p.position = a + d * s.x;
            p.velocity = d * s.y;
        }
        // Cone: a = vértice, b = direção, s.x = meio-ângulo (rad), s.y = velocidade.
        case 2u: {
            let l = sample_cone(vec2f(emit_rand(i, seed, 0u), emit_rand(i, seed, 1u)), cos(s.x));
            let w = normalize(b);
            let e = basis_cross(w, select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(w.x) > 0.9));
            p.position = a;
            p.velocity = (e[0] * l.x + e[1] * l.y + w * l.z) * s.y;
        }
        // Ponto: a = posição, b = velocidade.
        default: {
            p.position = a;
            p.velocity = b;
        }
    }
    return p;
}
