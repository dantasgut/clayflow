// Hierarquia LBVH (Karras 2012, alg. 3) sobre as chaves de Morton ordenadas (spec 033, R1): cada nó interno i acha a
// faixa de folhas que cobre pelo prefixo comum das chaves (empate desfeito pelo índice) e a divide onde o prefixo muda.
// Os `n − 1` nós internos (raiz no 0) vêm antes das `n` folhas na faixa da hierarquia; os filhos são índices locais e
// cada nó guarda o pai (`ray_parents`, para o reajuste). A folha j aponta a primitiva `ray_values[j]` (ordem de Morton),
// ou o triângulo j (os triângulos são reordenados na ordem das folhas).
// As caixas vêm depois, pelo reajuste (`ray_refit`).
// Requer: WORKGROUP_SIZE, ray_common, build, ray_keys_read, ray_values_read, ray_bvh_out, ray_parents.

/** Prefixo comum de (chave, índice) das folhas i e j; −1 fora de [0, n). */
fn ray_delta(i: i32, j: i32) -> i32 {
    let n = i32(build.leaves);
    if (j < 0 || j >= n) { return -1; }
    // Folhas de `build.leafSize` primitivas consecutivas (já em ordem de Morton): a chave da folha é a da primeira.
    let a = ray_keys[u32(i) * build.leafSize];
    let b = ray_keys[u32(j) * build.leafSize];
    if (a == b) { return 32 + i32(countLeadingZeros(u32(i) ^ u32(j))); }
    return i32(countLeadingZeros(a ^ b));
}

/** Palavra do nó local de uma hierarquia. */
fn ray_node_word(local: u32) -> u32 {
    return build.nodeFirst + (build.nodeBase + local) * RAY_NODE_WORDS;
}

/** Escreve os filhos de um nó (o `w` das duas palavras), sem tocar na caixa. */
fn ray_set_children(local: u32, left: u32, right: u32) {
    let k = ray_node_word(local);
    ray_bvh_out[k].word.w = left;
    ray_bvh_out[k + 1u].word.w = right;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_lbvh_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let gi = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (gi + 1u >= build.leaves) { return; }
    let i = i32(gi);
    let d = select(-1, 1, ray_delta(i, i + 1) - ray_delta(i, i - 1) >= 0);
    let d_min = ray_delta(i, i - d);
    var l_max = 2;
    while (ray_delta(i, i + l_max * d) > d_min) { l_max = l_max * 2; }
    var l = 0;
    var t = l_max >> 1u;
    while (t >= 1) {
        if (ray_delta(i, i + (l + t) * d) > d_min) { l = l + t; }
        t = t >> 1u;
    }
    let j = i + l * d;
    let first = min(i, j);
    let last = max(i, j);
    // Divisão: a última folha do filho esquerdo.
    let prefix = ray_delta(first, last);
    var split = first;
    var step = last - first;
    loop {
        step = (step + 1) >> 1u;
        let next = split + step;
        if (next < last && ray_delta(first, next) > prefix) { split = next; }
        if (step <= 1) { break; }
    }
    let leaf0 = build.leaves - 1u;
    let left = select(u32(split), leaf0 + u32(split), split == first);
    let right = select(u32(split + 1), leaf0 + u32(split + 1), split + 1 == last);
    ray_set_children(gi, left, right);
    ray_parents[build.nodeBase + left] = gi;
    ray_parents[build.nodeBase + right] = gi;
}

@compute @workgroup_size(WORKGROUP_SIZE)
fn ray_lbvh_leaves_main(@builtin(global_invocation_id) gid3: vec3u, @builtin(num_workgroups) nwg: vec3u) {
    let j = gid3.x + gid3.y * nwg.x * WORKGROUP_SIZE;
    if (j >= build.leaves) { return; }
    let leaf = build.leaves - 1u + j;
    // Triângulos são reordenados na ordem das folhas (`ray_reorder`): a folha j aponta o primeiro dos seus
    // `build.leafSize` triângulos. Esferas e instâncias (uma por folha) ficam na ordem original: a folha aponta a
    // primitiva ordenada.
    let prim = select(ray_values[j], j * build.leafSize, build.kind == RAY_KIND_TRIANGLES);
    ray_set_children(leaf, RAY_LEAF | j, prim);
    // A raiz (nó 0, ou a única folha) não tem pai.
    if (leaf == 0u) { ray_parents[build.nodeBase] = NONE; }
}
