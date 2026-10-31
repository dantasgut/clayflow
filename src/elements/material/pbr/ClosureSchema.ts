import { FieldType } from '../../../scene/descriptors/FieldType';
import { StructSchema } from '../../../scene/descriptors/StructSchema';

/**
 * O fechamento de espalhamento (spec 011, R5): o que o ponto `material` devolve e os nós `bsdf.*`/`closure.*` compõem —
 * o struct `Closure` do WGSL, gerado deste schema (o layout e o tamanho em storage saem dele: a onda dos acertos da
 * spec 039 guarda um por acerto). Os lobos e as regras de composição estão no módulo `closure`
 * (`math/closure.wgsl`).
 */
export const ClosureSchema = new StructSchema('Closure', {
    // Difuso (Oren-Nayar energético).
    diffuse_weight: FieldType.f32,
    diffuse_color: FieldType.vec3f,
    diffuse_roughness: FieldType.f32,
    // Subsuperfície no modelo (difuso com "wrap" por canal).
    subsurface_weight: FieldType.f32,
    subsurface_color: FieldType.vec3f,
    subsurface_radius: FieldType.vec3f,
    // Especular de base: parte dielétrica (F0 do IOR, tinta) e parte condutora (F0 e tinta F82), mesma microgeometria.
    dielectric_weight: FieldType.f32,
    dielectric_ior: FieldType.f32,
    dielectric_tint: FieldType.vec3f,
    conductor_weight: FieldType.f32,
    conductor_f0: FieldType.vec3f,
    conductor_tint: FieldType.vec3f,
    specular_roughness: FieldType.f32,
    specular_anisotropy: FieldType.f32,
    // Tangente do especular anisotrópico (0 = a do referencial padrão).
    tangent: FieldType.vec3f,
    // Filme fino sobre o especular de base.
    film_weight: FieldType.f32,
    film_thickness: FieldType.f32,
    film_ior: FieldType.f32,
    // Verniz (camada de cima): dielétrico liso com cor de absorção e normal própria (0 = a geométrica).
    coat_weight: FieldType.f32,
    coat_ior: FieldType.f32,
    coat_roughness: FieldType.f32,
    coat_color: FieldType.vec3f,
    coat_normal: FieldType.vec3f,
    // Brilho de fibra (Charlie), por cima de tudo.
    sheen_weight: FieldType.f32,
    sheen_color: FieldType.vec3f,
    sheen_roughness: FieldType.f32,
    // Transmissão com refração: cor e distância de absorção (Beer-Lambert), IOR, número de Abbe (0 = sem dispersão).
    transmission_weight: FieldType.f32,
    transmission_color: FieldType.vec3f,
    transmission_depth: FieldType.f32,
    transmission_ior: FieldType.f32,
    transmission_abbe: FieldType.f32,
    transmission_roughness: FieldType.f32,
    // Prioridade do meio na sobreposição de volumes transmissivos (a maior vale dentro da interseção; empate: o último
    // em que o raio entrou). Padrão 0.
    transmission_priority: FieldType.f32,
    // Parede fina (0 ou 1): a superfície é uma placa de espessura zero, sem interior — a luz atravessa sem desviar, com
    // as reflexões entre as duas faces; nenhum meio entra na pilha. Padrão 0 (a superfície fecha um volume).
    transmission_thin: FieldType.f32,
    // Parede fina: transmissão difusa sem refração.
    translucent_weight: FieldType.f32,
    translucent_color: FieldType.vec3f,
    // Emissão (nits) e opacidade.
    emission: FieldType.vec3f,
    opacity: FieldType.f32,
    // Normal de base própria (0 = a geométrica).
    normal: FieldType.vec3f,
});
