// Nó `set.distributeOnMesh` (spec 031), predicado da compactação estável: o candidato i é aceito quando o hash
// (semente, t, 3k + 2) em [0, 1) fica abaixo da densidade no ponto — a entrada de ponto `density`, fundida aqui —, presa
// em [0, 1]. A saída é o próprio índice do candidato; a compactação estável preserva a ordem dos candidatos, então os
// pontos saem na ordem (triângulo, k), a mesma da referência da CPU.
// Requer: distribute_sample, distribute_density (pronto ou grafo).

fn compact_keep(i: u32) -> bool {
    let t = i / distribute.per_triangle;
    let k = i % distribute.per_triangle;
    let s = distribute_sample(i);
    let d = clamp(distribute_density(s.position, s.normal, s.uv), 0.0, 1.0);
    return random_unit(hash3(vec3u(distribute.seed, t, 3u * k + 2u))) < d;
}

fn compact_value(i: u32) -> u32 {
    return i;
}
