// A sombra das nuvens na luz do sol do `Sky` (spec 041, R11): contribuição ao ponto `light_transmission` — quem recebe
// a luz do sol (o chão, a água, os objetos, as sondas da GI, a névoa, a própria nuvem) a recebe × a transmitância das
// nuvens até o disco do sol pelo mapa visto do sol (a penumbra); as outras luzes passam sem mudança.
// Requer: sky, cloud_shadow_lookup.

fn light_transmission(light: u32, p: vec3f) -> vec3f {
    if (light == sky.sunSlot) { return vec3f(cloud_shadow_transmittance_disk(p, sky.sunIlluminance.w)); }
    return vec3f(1.0);
}
