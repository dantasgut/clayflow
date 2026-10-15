// Espaço pronto (spec 009): identidade — `space_map` devolve o ponto e `space_normal` a normal, sem custo. Com
// `SpaceFunction`s na cena, a C2 troca este módulo pela composição: x' = space_fn(x) (em sequência) e a normal pela
// inversa transposta da Jacobiana (fornecida por `space_jacobian` ou por diferenças centrais); Jacobiana singular
// mantém a normal.
// Requer: nada.

fn space_map(x: vec3f, time: f32) -> vec3f {
    return x;
}

fn space_normal(x: vec3f, time: f32, n: vec3f) -> vec3f {
    return n;
}
