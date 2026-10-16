// Nós de matemática (spec 031): uma função por nó, entradas e depois parâmetros, na ordem das portas.
// Requer: nada.

fn node_math_add(a: f32, b: f32) -> f32 {
    return a + b;
}

fn node_math_mix(a: vec3f, b: vec3f, t: f32) -> vec3f {
    return mix(a, b, t);
}
