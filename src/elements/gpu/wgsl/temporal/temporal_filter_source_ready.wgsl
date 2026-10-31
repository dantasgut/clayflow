// Ponto `temporal_filter_source` (spec 034, R3, T044a): o sinal traçado que o filtro (`temporal_filter_*`) limpa, uma
// amostra por pixel e por quadro. Quem produz o sinal troca este pronto pela sua implementação (`bindPoints`); o pronto
// não tem sinal (nenhum pixel válido).
//   - `temporal_filter_source_size()`: o tamanho do sinal em pixels;
//   - `temporal_filter_source_valid(q)`: o pixel `q` tem sinal neste quadro;
//   - `temporal_filter_source_signal(q)`: a amostra (radiância);
//   - `temporal_filter_source_guide(q)`: o guia — o ponto de mundo que o pixel mostra (xyz) e, em bits, o id do objeto
//     (w): pixels com o mesmo objeto e pontos próximos se misturam;
//   - `temporal_filter_source_albedo(q)`: a refletância da superfície que o pixel mostra — o guia de textura: pixels de
//     albedo diferente (as casas de um xadrez visto pelo vidro) não se misturam no filtro espacial;
//   - `temporal_filter_source_previous_point(guide)`: onde estava esse ponto no quadro anterior (o objeto se move);
//   - `temporal_filter_source_footprint(q, guide)`: a largura do pixel no ponto (a escala das distâncias do guia);
//   - `temporal_filter_source_change(q)`: quanto a cena mudou em volta do pixel desde o quadro anterior, em 0–1 (o
//     gradiente temporal do A-SVGF: 0 onde nada mudou, também com a câmera em movimento);
//   - `temporal_filter_source_fresh(q)`: a amostra do pixel é deste quadro (quem traça uma parte dos pixels por quadro —
//     a refração em meia resolução — reconstrói os outros dos vizinhos traçados: o filtro guarda o histórico válido
//     deles em vez de misturar a reconstrução, e usa a reconstrução onde não há histórico).
// Requer: nada.

fn temporal_filter_source_size() -> vec2u {
    return vec2u(1u);
}

fn temporal_filter_source_valid(q: vec2u) -> bool {
    return false;
}

fn temporal_filter_source_signal(q: vec2u) -> vec3f {
    return vec3f(0.0);
}

fn temporal_filter_source_guide(q: vec2u) -> vec4f {
    return vec4f(0.0);
}

fn temporal_filter_source_albedo(q: vec2u) -> vec3f {
    return vec3f(0.0);
}

fn temporal_filter_source_previous_point(guide: vec4f) -> vec3f {
    return guide.xyz;
}

fn temporal_filter_source_footprint(q: vec2u, guide: vec4f) -> f32 {
    return 1.0;
}

fn temporal_filter_source_change(q: vec2u) -> f32 {
    return 0.0;
}

fn temporal_filter_source_fresh(q: vec2u) -> bool {
    return true;
}
