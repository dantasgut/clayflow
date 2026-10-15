// Função pronta do ponto `emit` (spec 009): as formas do emissor — ponto (posição e velocidade fixas), esfera
// (superfície do raio, velocidade radial) e cone (do vértice, dentro do meio-ângulo em torno da direção). Uma
// `EmitFunction` toma o lugar deste módulo com a mesma assinatura:
//   fn emit_fn(i: u32, time: f32, seed: u32, data: EmitFnParams) -> EmittedParticle
// `i` é o índice global da partícula no emissor (0, 1, 2… na ordem de criação), `time` o tempo simulado do passo.
// Requer: structs EmitterParams, EmitFnRecord; emit_point_types; o uniforme `emit_params` do kernel.

struct EmitFnParams {
    _unused: u32,
}

fn emit_fn_params(r: EmitFnRecord) -> EmitFnParams {
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
            let u = emit_rand(i, seed, 0u) * 2.0 - 1.0;
            let th = emit_rand(i, seed, 1u) * 6.2831853;
            let r = sqrt(max(1.0 - u * u, 0.0));
            let d = vec3f(r * cos(th), u, r * sin(th));
            p.position = a + d * s.x;
            p.velocity = d * s.y;
        }
        // Cone: a = vértice, b = direção, s.x = meio-ângulo (rad), s.y = velocidade.
        case 2u: {
            let ct = 1.0 - emit_rand(i, seed, 0u) * (1.0 - cos(s.x));
            let st = sqrt(max(1.0 - ct * ct, 0.0));
            let ph = emit_rand(i, seed, 1u) * 6.2831853;
            let w = normalize(b);
            let other = select(vec3f(1.0, 0.0, 0.0), vec3f(0.0, 1.0, 0.0), abs(w.x) > 0.9);
            let e1 = normalize(cross(other, w));
            let e2 = cross(w, e1);
            p.position = a;
            p.velocity = (e1 * (st * cos(ph)) + e2 * (st * sin(ph)) + w * ct) * s.y;
        }
        // Ponto: a = posição, b = velocidade.
        default: {
            p.position = a;
            p.velocity = b;
        }
    }
    return p;
}
