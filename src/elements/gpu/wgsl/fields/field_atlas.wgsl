// O atlas dos voxels do campo dos fluidos (T060f): a página 12³ do bloco `brick` (os 8³ do interior e 2 de borda de cada
// lado) na textura 3D, as páginas em ordem x, y, z. φ no canal x. A leitura pontual (`textureLoad`, a tricúbica e a
// malha) e a trilinear pela filtragem do hardware (os passos da marcha: uma amostra no lugar de oito leituras).
// Requer: fluid_field, field_common, field_atlas, field_sampler.

/**
 * Texel de origem da página do bloco `brick` no atlas: as páginas por eixo são potências de dois, com os expoentes de x e
 * de y em `fluid_field.limits.w` (8 bits cada) — deslocamentos e máscaras, sem divisão inteira.
 */
fn field_atlas_origin(brick: u32) -> vec3i {
    let lx = fluid_field.limits.w & 0xffu;
    let ly = (fluid_field.limits.w >> 8u) & 0xffu;
    let p = vec3u(brick & ((1u << lx) - 1u), (brick >> lx) & ((1u << ly) - 1u), brick >> (lx + ly));
    return vec3i(p) * FIELD_STRIDE;
}

/** φ do voxel `v` (−2..9 em cada eixo) do bloco `brick`. */
fn field_atlas_at(brick: u32, v: vec3i) -> f32 {
    return textureLoad(field_atlas, field_atlas_origin(brick) + v + vec3i(FIELD_APRON), 0).x;
}

/**
 * φ trilinear na posição `g` em voxels do bloco `brick` (o centro do voxel v em g = v), pela filtragem do hardware; `g`
 * preso aos centros da página (−2..9): fora deles, o valor da borda.
 */
fn field_atlas_linear(brick: u32, g: vec3f) -> f32 {
    let c = clamp(g, vec3f(f32(-FIELD_APRON)), vec3f(f32(FIELD_BRICK + FIELD_APRON - 1)));
    let uvw = (vec3f(field_atlas_origin(brick)) + c + f32(FIELD_APRON) + 0.5) * fluid_field.atlas.xyz;
    return textureSampleLevel(field_atlas, field_sampler, uvw, 0.0).x;
}
