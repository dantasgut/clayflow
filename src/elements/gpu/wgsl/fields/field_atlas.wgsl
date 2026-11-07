// O atlas dos voxels do campo dos fluidos (T060f): a página do bloco `brick` no fim do buffer das consultas (a partir da
// palavra `fluid_field.limits.w`; a série por páginas do buffer): os 12³ voxels (os 8³ do interior e 2 de borda de cada
// lado), φ em f32, em ordem x, y, z. A leitura pontual (a tricúbica e a malha) e a trilinear (os passos da marcha).
// Requer: fluid_field, field_common, field_data (leitura).

/** φ do voxel `v` (−2..9 em cada eixo) do bloco `brick`. */
fn field_atlas_at(brick: u32, v: vec3i) -> f32 {
    return bitcast<f32>(field_data[fluid_field.limits.w + field_atlas_index(brick, v)]);
}

/**
 * φ trilinear na posição `g` em voxels do bloco `brick` (o centro do voxel v em g = v); os cantos presos aos voxels da
 * página (−2..9): fora deles, o valor da borda.
 */
fn field_atlas_linear(brick: u32, g: vec3f) -> f32 {
    let base = vec3i(floor(g));
    let f = g - vec3f(base);
    var phi = 0.0;
    for (var k = 0u; k < 8u; k++) {
        let o = vec3i(i32(k & 1u), i32((k >> 1u) & 1u), i32(k >> 2u));
        let v = clamp(base + o, vec3i(-FIELD_APRON), vec3i(FIELD_BRICK + FIELD_APRON - 1));
        let w = mix(vec3f(1.0) - f, f, vec3f(o));
        phi += field_atlas_at(brick, v) * w.x * w.y * w.z;
    }
    return phi;
}
