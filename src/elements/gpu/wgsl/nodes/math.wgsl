// Nós de matemática (spec 031, R12): uma função por nó, entradas e depois parâmetros, na ordem das portas. Tipos fixos
// por nó — sem sufixo, escalar (`f32`); `2`/`3`/`4`, vetor de tantas componentes. Vários resultados: um struct com os
// nomes das saídas.
// Requer: nada.

struct NodeSplit2 {
    x: f32,
    y: f32,
}

struct NodeSplit3 {
    x: f32,
    y: f32,
    z: f32,
}

struct NodeSplit4 {
    x: f32,
    y: f32,
    z: f32,
    w: f32,
}

// Constantes: o parâmetro do nó (muda sem recompilar).

fn node_math_value(value: f32) -> f32 {
    return value;
}

fn node_math_value2(value: vec2f) -> vec2f {
    return value;
}

fn node_math_value3(value: vec3f) -> vec3f {
    return value;
}

fn node_math_value4(value: vec4f) -> vec4f {
    return value;
}

// Aritmética escalar.

fn node_math_add(a: f32, b: f32) -> f32 {
    return a + b;
}

fn node_math_sub(a: f32, b: f32) -> f32 {
    return a - b;
}

fn node_math_mul(a: f32, b: f32) -> f32 {
    return a * b;
}

fn node_math_div(a: f32, b: f32) -> f32 {
    return a / b;
}

fn node_math_min(a: f32, b: f32) -> f32 {
    return min(a, b);
}

fn node_math_max(a: f32, b: f32) -> f32 {
    return max(a, b);
}

fn node_math_abs(x: f32) -> f32 {
    return abs(x);
}

fn node_math_floor(x: f32) -> f32 {
    return floor(x);
}

fn node_math_fract(x: f32) -> f32 {
    return fract(x);
}

// Interpolação, limites e degraus.

fn node_math_mix(a: f32, b: f32, t: f32) -> f32 {
    return mix(a, b, t);
}

fn node_math_clamp(x: f32, low: f32, high: f32) -> f32 {
    return clamp(x, low, high);
}

fn node_math_smoothstep(edge0: f32, edge1: f32, x: f32) -> f32 {
    return smoothstep(edge0, edge1, x);
}

// Potência e trigonometria.

fn node_math_pow(x: f32, e: f32) -> f32 {
    return pow(x, e);
}

fn node_math_sqrt(x: f32) -> f32 {
    return sqrt(x);
}

fn node_math_sin(x: f32) -> f32 {
    return sin(x);
}

fn node_math_cos(x: f32) -> f32 {
    return cos(x);
}

fn node_math_tan(x: f32) -> f32 {
    return tan(x);
}

fn node_math_atan2(y: f32, x: f32) -> f32 {
    return atan2(y, x);
}

// Vetores de 3 componentes.

fn node_math_add3(a: vec3f, b: vec3f) -> vec3f {
    return a + b;
}

fn node_math_sub3(a: vec3f, b: vec3f) -> vec3f {
    return a - b;
}

fn node_math_mul3(a: vec3f, b: vec3f) -> vec3f {
    return a * b;
}

fn node_math_div3(a: vec3f, b: vec3f) -> vec3f {
    return a / b;
}

fn node_math_scale3(v: vec3f, s: f32) -> vec3f {
    return v * s;
}

fn node_math_mix3(a: vec3f, b: vec3f, t: f32) -> vec3f {
    return mix(a, b, t);
}

fn node_math_dot(a: vec3f, b: vec3f) -> f32 {
    return dot(a, b);
}

fn node_math_cross(a: vec3f, b: vec3f) -> vec3f {
    return cross(a, b);
}

fn node_math_normalize(v: vec3f) -> vec3f {
    return normalize(v);
}

fn node_math_length(v: vec3f) -> f32 {
    return length(v);
}

fn node_math_distance(a: vec3f, b: vec3f) -> f32 {
    return distance(a, b);
}

// Conversões entre inteiro e real (índices e sementes dos pontos para a matemática, e de volta).

fn node_math_to_float(x: u32) -> f32 {
    return f32(x);
}

fn node_math_to_uint(x: f32) -> u32 {
    return u32(max(x, 0.0));
}

// Separar e combinar componentes.

fn node_math_split2(v: vec2f) -> NodeSplit2 {
    return NodeSplit2(v.x, v.y);
}

fn node_math_combine2(x: f32, y: f32) -> vec2f {
    return vec2f(x, y);
}

fn node_math_split3(v: vec3f) -> NodeSplit3 {
    return NodeSplit3(v.x, v.y, v.z);
}

fn node_math_combine3(x: f32, y: f32, z: f32) -> vec3f {
    return vec3f(x, y, z);
}

fn node_math_split4(v: vec4f) -> NodeSplit4 {
    return NodeSplit4(v.x, v.y, v.z, v.w);
}

fn node_math_combine4(x: f32, y: f32, z: f32, w: f32) -> vec4f {
    return vec4f(x, y, z, w);
}
