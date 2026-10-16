// Campos de força prontos (spec 009): soma, na posição `x` e velocidade `v`, as acelerações dos campos do pool
// `FieldBuiltinRecord` (spec 031, R8: registro próprio dos campos prontos; as funções `field` do usuário têm os pools
// das suas formas). Slot livre é zerado pela C2 (`kind` 0, fora do laço). Registro: `kind` (código de tipo), vetores
// `a`, `b`, `s`:
//   1 gravidade de fonte pontual: a = posição da fonte, s.x = G·M, s.y = suavização (m²)
//   2 vento:     a = direção · intensidade, s.x = turbulência, s.y = escala espacial do ruído (1/m)
//   3 vórtice:   a = eixo (unitário), b = centro, s.x = intensidade (m/s²), s.y = decaimento (1/m)
//   4 arrasto:   s.x = coeficiente linear (1/s), s.y = quadrático (1/m)
//   5 empuxo:    s.x = densidade do meio, s.y = nível da superfície (y), s.z = gravidade (m/s²)
// A gravidade uniforme continua nos parâmetros de cada solver (soma exata com estes termos).
// Requer: struct FieldBuiltinRecord; field_point_types; noise; o recurso `field_builtin_records` e os códigos de tipo
// (constantes compartilhadas `FIELD_*`).

fn field_builtin(x: vec3f, v: vec3f, time: f32, body: FieldBody) -> vec3f {
    var acc = vec3f(0.0);
    let n = arrayLength(&field_builtin_records);
    for (var k = 0u; k < n; k++) {
        let r = field_builtin_records[k];
        let kind = r.kind;
        if (kind == 0u) { continue; }
        let a = r.a;
        let b = r.b;
        let s = r.s;
        switch kind {
            case FIELD_GRAVITY_POINT: {
                let d = a.xyz - x;
                let r2 = max(dot(d, d), max(s.y, 1e-8));
                acc += s.x * d * inverseSqrt(r2) / r2;
            }
            case FIELD_WIND: {
                let gust = value_noise3(x * s.y + vec3f(time * 0.7, time * 0.3, -time * 0.5));
                acc += a.xyz * (1.0 + s.x * gust);
            }
            case FIELD_VORTEX: {
                let rel = x - b.xyz;
                let radial = rel - a.xyz * dot(rel, a.xyz);
                let d = length(radial);
                if (d > 1e-6) {
                    acc += cross(a.xyz, radial / d) * s.x * exp(-s.y * d);
                }
            }
            case FIELD_DRAG: {
                acc -= (s.x + s.y * length(v)) * v;
            }
            case FIELD_BUOYANCY: {
                if (x.y < s.y && body.density > 0.0) {
                    acc += vec3f(0.0, s.z * s.x / body.density, 0.0);
                }
            }
            default: {}
        }
    }
    return acc;
}
