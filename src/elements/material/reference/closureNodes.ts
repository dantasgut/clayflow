// Referência em CPU da composição de fechamentos (spec 011, R5): o struct `Closure`, os construtores dos lobos e
// `closure_add`/`closure_mix`/`closure_layer`/filme fino/opacidade/normal com a mesma aritmética do módulo WGSL
// `closure` — a regra de fusão dos lobos do mesmo bin. Para os testes, os casos dos nós (`nodeGraphs`, parte f) e o
// smoke `materials`.

import type { Vec3 } from './bsdf';

/** Campos do `Closure` na ordem do struct WGSL (o achatamento por componentes segue esta ordem). */
export const CLOSURE_FIELDS = [
    ['diffuse_weight', 1],
    ['diffuse_color', 3],
    ['diffuse_roughness', 1],
    ['subsurface_weight', 1],
    ['subsurface_color', 3],
    ['subsurface_radius', 3],
    ['dielectric_weight', 1],
    ['dielectric_ior', 1],
    ['dielectric_tint', 3],
    ['conductor_weight', 1],
    ['conductor_f0', 3],
    ['conductor_tint', 3],
    ['specular_roughness', 1],
    ['specular_anisotropy', 1],
    ['tangent', 3],
    ['film_weight', 1],
    ['film_thickness', 1],
    ['film_ior', 1],
    ['coat_weight', 1],
    ['coat_ior', 1],
    ['coat_roughness', 1],
    ['coat_color', 3],
    ['coat_normal', 3],
    ['sheen_weight', 1],
    ['sheen_color', 3],
    ['sheen_roughness', 1],
    ['transmission_weight', 1],
    ['transmission_color', 3],
    ['transmission_depth', 1],
    ['transmission_ior', 1],
    ['transmission_abbe', 1],
    ['transmission_roughness', 1],
    ['transmission_priority', 1],
    ['translucent_weight', 1],
    ['translucent_color', 3],
    ['emission', 3],
    ['opacity', 1],
    ['normal', 3],
] as const;

type Field = (typeof CLOSURE_FIELDS)[number];
/** Fechamento: cada campo escalar ou `vec3`. */
export type Closure = {
    [F in Field as F[0]]: F[1] extends 3 ? Vec3 : number;
};

/** Componentes do fechamento achatado. */
export const CLOSURE_SIZE = CLOSURE_FIELDS.reduce((n, [, k]) => n + k, 0);

const clamp = (x: number, lo: number, hi: number): number => Math.min(Math.max(x, lo), hi);
const c01 = (x: number): number => clamp(x, 0, 1);
const c3 = (v: Vec3): Vec3 => [c01(v[0]), c01(v[1]), c01(v[2])];
const max03 = (v: Vec3): Vec3 => [Math.max(v[0], 0), Math.max(v[1], 0), Math.max(v[2], 0)];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale3 = (v: Vec3, k: number): Vec3 => [v[0] * k, v[1] * k, v[2] * k];

/** Fechamento achatado na ordem do struct. */
export function flattenClosure(c: Closure): number[] {
    const out: number[] = [];
    for (const [name, k] of CLOSURE_FIELDS) {
        const v = c[name];
        if (k === 1) out.push(v as number);
        else out.push(...(v as Vec3));
    }
    return out;
}

/** Fechamento de um vetor achatado. */
export function unflattenClosure(values: readonly number[]): Closure {
    const out: Record<string, number | Vec3> = {};
    let i = 0;
    for (const [name, k] of CLOSURE_FIELDS) {
        out[name] = k === 1 ? values[i]! : [values[i]!, values[i + 1]!, values[i + 2]!];
        i += k;
    }
    return out as Closure;
}

/** `closure_zero`. */
export function closureZero(): Closure {
    const values = new Array<number>(CLOSURE_SIZE).fill(0);
    const c = unflattenClosure(values);
    return {
        ...c,
        dielectric_ior: 1.5,
        dielectric_tint: [1, 1, 1],
        conductor_tint: [1, 1, 1],
        film_ior: 1.3,
        coat_ior: 1.5,
        coat_color: [1, 1, 1],
        transmission_color: [1, 1, 1],
        transmission_ior: 1.5,
        opacity: 1,
    };
}

export const closureDiffuse = (color: Vec3, roughness: number): Closure => ({
    ...closureZero(),
    diffuse_weight: 1,
    diffuse_color: c3(color),
    diffuse_roughness: c01(roughness),
});

export const closureConductor = (
    f0: Vec3,
    tint: Vec3,
    roughness: number,
    anisotropy: number,
    tangent: Vec3,
): Closure => ({
    ...closureZero(),
    conductor_weight: 1,
    conductor_f0: c3(f0),
    conductor_tint: c3(tint),
    specular_roughness: c01(roughness),
    specular_anisotropy: clamp(anisotropy, -1, 1),
    tangent,
});

export const closureDielectric = (
    ior: number,
    tint: Vec3,
    roughness: number,
    anisotropy: number,
    tangent: Vec3,
): Closure => ({
    ...closureZero(),
    dielectric_weight: 1,
    dielectric_ior: Math.max(ior, 1),
    dielectric_tint: c3(tint),
    specular_roughness: c01(roughness),
    specular_anisotropy: clamp(anisotropy, -1, 1),
    tangent,
});

export const closureTransmission = (
    ior: number,
    color: Vec3,
    depth: number,
    abbe: number,
    roughness: number,
): Closure => ({
    ...closureZero(),
    transmission_weight: 1,
    transmission_ior: Math.max(ior, 1),
    transmission_color: c3(color),
    transmission_depth: Math.max(depth, 0),
    transmission_abbe: abbe > 0 ? Math.max(abbe, 10) : 0,
    transmission_roughness: c01(roughness),
});

/** `closure_medium_priority`: a prioridade do meio na sobreposição de volumes transmissivos. */
export const closureMediumPriority = (c: Closure, priority: number): Closure => ({
    ...c,
    transmission_priority: priority,
});

export const closureTranslucent = (color: Vec3): Closure => ({
    ...closureZero(),
    translucent_weight: 1,
    translucent_color: c3(color),
});

export const closureSheen = (color: Vec3, roughness: number): Closure => ({
    ...closureZero(),
    sheen_weight: 1,
    sheen_color: c3(color),
    sheen_roughness: clamp(roughness, 0.03, 1),
});

export const closureSubsurface = (color: Vec3, radius: Vec3): Closure => ({
    ...closureZero(),
    subsurface_weight: 1,
    subsurface_color: c3(color),
    subsurface_radius: c3(radius),
});

export const closureEmission = (color: Vec3, luminance: number): Closure => ({
    ...closureZero(),
    emission: scale3(max03(color), Math.max(luminance, 0)),
});

const merge1 = (a: number, wa: number, b: number, wb: number): number => {
    const w = wa + wb;
    return w > 1e-8 ? (a * wa + b * wb) / w : a;
};
const merge3 = (a: Vec3, wa: number, b: Vec3, wb: number): Vec3 => {
    const w = wa + wb;
    return w > 1e-8 ? ([0, 1, 2].map((k) => (a[k]! * wa + b[k]! * wb) / w) as unknown as Vec3) : a;
};
/** Rugosidade fundida em α² (a regra de fusão documentada). */
export const mergeRoughness = (a: number, wa: number, b: number, wb: number): number =>
    Math.sqrt(Math.sqrt(merge1(a ** 4, wa, b ** 4, wb)));
const mergeDir = (a: Vec3, wa: number, b: Vec3, wb: number): Vec3 => {
    const ka = dot(a, a) > 0 ? wa : 0;
    const kb = dot(b, b) > 0 ? wb : 0;
    const s: Vec3 = [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
    const l2 = dot(s, s);
    return l2 > 1e-12 ? scale3(s, 1 / Math.sqrt(l2)) : [0, 0, 0];
};

/** `closure_scale`: pesos, emissão e opacidade × `k`. */
export function closureScale(c: Closure, k: number): Closure {
    return {
        ...c,
        diffuse_weight: c.diffuse_weight * k,
        subsurface_weight: c.subsurface_weight * k,
        dielectric_weight: c.dielectric_weight * k,
        conductor_weight: c.conductor_weight * k,
        film_weight: c.film_weight * k,
        coat_weight: c.coat_weight * k,
        sheen_weight: c.sheen_weight * k,
        transmission_weight: c.transmission_weight * k,
        translucent_weight: c.translucent_weight * k,
        emission: scale3(c.emission, k),
        opacity: c.opacity * k,
    };
}

/** `closure_add`: pesos somados; parâmetros do mesmo bin fundidos pelo peso. */
export function closureAdd(a: Closure, b: Closure): Closure {
    const wsa = a.dielectric_weight + a.conductor_weight;
    const wsb = b.dielectric_weight + b.conductor_weight;
    const wta = a.transmission_weight;
    const wtb = b.transmission_weight;
    const wna =
        wsa + a.diffuse_weight + a.subsurface_weight + a.transmission_weight + a.translucent_weight;
    const wnb =
        wsb + b.diffuse_weight + b.subsurface_weight + b.transmission_weight + b.translucent_weight;
    return {
        diffuse_weight: a.diffuse_weight + b.diffuse_weight,
        diffuse_color: merge3(a.diffuse_color, a.diffuse_weight, b.diffuse_color, b.diffuse_weight),
        diffuse_roughness: merge1(
            a.diffuse_roughness,
            a.diffuse_weight,
            b.diffuse_roughness,
            b.diffuse_weight,
        ),
        subsurface_weight: a.subsurface_weight + b.subsurface_weight,
        subsurface_color: merge3(
            a.subsurface_color,
            a.subsurface_weight,
            b.subsurface_color,
            b.subsurface_weight,
        ),
        subsurface_radius: merge3(
            a.subsurface_radius,
            a.subsurface_weight,
            b.subsurface_radius,
            b.subsurface_weight,
        ),
        dielectric_weight: a.dielectric_weight + b.dielectric_weight,
        dielectric_ior: merge1(
            a.dielectric_ior,
            a.dielectric_weight,
            b.dielectric_ior,
            b.dielectric_weight,
        ),
        dielectric_tint: merge3(
            a.dielectric_tint,
            a.dielectric_weight,
            b.dielectric_tint,
            b.dielectric_weight,
        ),
        conductor_weight: a.conductor_weight + b.conductor_weight,
        conductor_f0: merge3(
            a.conductor_f0,
            a.conductor_weight,
            b.conductor_f0,
            b.conductor_weight,
        ),
        conductor_tint: merge3(
            a.conductor_tint,
            a.conductor_weight,
            b.conductor_tint,
            b.conductor_weight,
        ),
        specular_roughness: mergeRoughness(a.specular_roughness, wsa, b.specular_roughness, wsb),
        specular_anisotropy: merge1(a.specular_anisotropy, wsa, b.specular_anisotropy, wsb),
        tangent: mergeDir(a.tangent, wsa, b.tangent, wsb),
        film_weight: a.film_weight + b.film_weight,
        film_thickness: merge1(a.film_thickness, a.film_weight, b.film_thickness, b.film_weight),
        film_ior: merge1(a.film_ior, a.film_weight, b.film_ior, b.film_weight),
        coat_weight: a.coat_weight + b.coat_weight,
        coat_ior: merge1(a.coat_ior, a.coat_weight, b.coat_ior, b.coat_weight),
        coat_roughness: mergeRoughness(
            a.coat_roughness,
            a.coat_weight,
            b.coat_roughness,
            b.coat_weight,
        ),
        coat_color: merge3(a.coat_color, a.coat_weight, b.coat_color, b.coat_weight),
        coat_normal: mergeDir(a.coat_normal, a.coat_weight, b.coat_normal, b.coat_weight),
        sheen_weight: a.sheen_weight + b.sheen_weight,
        sheen_color: merge3(a.sheen_color, a.sheen_weight, b.sheen_color, b.sheen_weight),
        sheen_roughness: merge1(
            a.sheen_roughness,
            a.sheen_weight,
            b.sheen_roughness,
            b.sheen_weight,
        ),
        transmission_weight: wta + wtb,
        transmission_color: merge3(a.transmission_color, wta, b.transmission_color, wtb),
        transmission_depth: merge1(a.transmission_depth, wta, b.transmission_depth, wtb),
        transmission_ior: merge1(a.transmission_ior, wta, b.transmission_ior, wtb),
        transmission_abbe: merge1(a.transmission_abbe, wta, b.transmission_abbe, wtb),
        transmission_roughness: mergeRoughness(
            a.transmission_roughness,
            wta,
            b.transmission_roughness,
            wtb,
        ),
        transmission_priority: Math.max(a.transmission_priority, b.transmission_priority),
        translucent_weight: a.translucent_weight + b.translucent_weight,
        translucent_color: merge3(
            a.translucent_color,
            a.translucent_weight,
            b.translucent_color,
            b.translucent_weight,
        ),
        emission: [
            a.emission[0] + b.emission[0],
            a.emission[1] + b.emission[1],
            a.emission[2] + b.emission[2],
        ],
        opacity: Math.min(a.opacity + b.opacity, 1),
        normal: mergeDir(a.normal, wna, b.normal, wnb),
    };
}

/** `closure_mix`. */
export const closureMix = (a: Closure, b: Closure, t: number): Closure => {
    const k = c01(t);
    return closureAdd(closureScale(a, 1 - k), closureScale(b, k));
};

/** `closure_layer`. */
export function closureLayer(
    top: Closure,
    base: Closure,
    topColor: Vec3,
    topWeight: number,
): Closure {
    const w = c01(topWeight);
    const coat: Closure = {
        ...closureZero(),
        coat_weight: top.dielectric_weight * w,
        coat_ior: top.dielectric_ior,
        coat_roughness: top.specular_roughness,
        coat_color: c3(topColor),
        coat_normal: top.normal,
    };
    const rest: Closure = { ...top, dielectric_weight: 0, opacity: 0 };
    return { ...closureAdd(closureAdd(base, coat), closureScale(rest, w)), opacity: base.opacity };
}

/** `closure_thin_film`. */
export const closureThinFilm = (c: Closure, thickness: number, ior: number): Closure => ({
    ...c,
    film_weight: 1,
    film_thickness: clamp(thickness, 0, 2000),
    film_ior: Math.max(ior, 1),
});

/** `closure_opacity`. */
export const closureOpacity = (c: Closure, alpha: number): Closure => ({
    ...c,
    opacity: c.opacity * c01(alpha),
});

/** `closure_normal`. */
export const closureNormal = (c: Closure, n: Vec3): Closure => {
    const l2 = dot(n, n);
    return { ...c, normal: l2 > 1e-12 ? scale3(n, 1 / Math.sqrt(l2)) : [0, 0, 0] };
};
