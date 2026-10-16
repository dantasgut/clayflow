// Nó de ruído de gradiente 3D (spec 031): `gradient_noise3(p · scale + offset)`, em [-1, 1].
// Requer: noise.

fn node_noise_gradient3(p: vec3f, scale: f32, offset: vec3f) -> f32 {
    return gradient_noise3(p * scale + offset);
}
