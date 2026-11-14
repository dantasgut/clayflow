// Endereçamento (spec 037, R2): os hashes que levam uma chave a um balde de tabela — a família separada da
// aleatoriedade (`random`). Sem a redução (`&` máscara ou `%` tamanho): quem chama reduz. Bit a bit (a ordem dos
// vizinhos da física depende deles).

// Teschner et al. (2003): célula inteira 3D → u32. Coordenadas com sinal entram por `bitcast<vec3u>`.
fn hash_cell(c: vec3u) -> u32 {
    return (c.x * 73856093u) ^ (c.y * 19349663u) ^ (c.z * 83492791u);
}

// Hash multiplicativo de Knuth (a razão áurea em 32 bits).
fn hash_knuth(key: u32) -> u32 {
    return key * 2654435761u;
}
