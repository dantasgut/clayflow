// Referência da CPU dos nós de material (spec 011): espalhamento (`bsdf.*`), composição (`closure.*`), saída de
// fechamento e cor (`color.rgb`/`hsv`/`temperature`/`luminance`). Os fechamentos são achatados na ordem do struct
// `Closure` (`CLOSURE_FIELDS`); as entradas de fechamento vêm de construtores sorteados. Tolerâncias: 1e-5 (cópias e
// médias ponderadas em f32; a rugosidade fundida em α² passa por duas raízes) e 2e-3 na temperatura de cor (log e pow).
import {
    closureAdd,
    closureConductor,
    closureDielectric,
    closureDiffuse,
    closureEmission,
    closureLayer,
    closureMediumPriority,
    closureMix,
    closureNormal,
    closureOpacity,
    closureSheen,
    closureSubsurface,
    closureThinFilm,
    closureThinWalled,
    closureTranslucent,
    closureTransmission,
    flattenClosure,
    unflattenClosure,
    type Closure,
} from '../../material/reference/closureNodes';
import type { Vec3 } from '../../material/reference/bsdf';
import { luminance, srgbDecode } from '../../math/reference/color';
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';

const v3 = (v: readonly number[]): Vec3 => [v[0]!, v[1]!, v[2]!];
const flat = (c: Closure): number[] => flattenClosure(c);

/** Fechamento sorteado (um ou dois lobos de tipos variados), achatado — entrada dos nós de composição. */
function randomClosure(r: () => number): number[] {
    const one = (): Closure => {
        switch (Math.floor(uniform(r, 0, 8))) {
            case 0:
                return closureDiffuse(v3(vector(r, 3, 0, 1)), uniform(r, 0, 1));
            case 1:
                return closureConductor(
                    v3(vector(r, 3, 0, 1)),
                    v3(vector(r, 3, 0, 1)),
                    uniform(r, 0, 1),
                    uniform(r, -1, 1),
                    v3(vector(r, 3, -1, 1)),
                );
            case 2:
                return closureDielectric(
                    uniform(r, 1, 2.5),
                    v3(vector(r, 3, 0, 1)),
                    uniform(r, 0, 1),
                    uniform(r, -1, 1),
                    v3(vector(r, 3, -1, 1)),
                );
            case 3:
                return closureTransmission(
                    uniform(r, 1, 2),
                    v3(vector(r, 3, 0, 1)),
                    uniform(r, 0, 3),
                    uniform(r, 0, 80),
                    uniform(r, 0, 1),
                );
            case 4:
                return closureSheen(v3(vector(r, 3, 0, 1)), uniform(r, 0, 1));
            case 5:
                return closureSubsurface(v3(vector(r, 3, 0, 1)), v3(vector(r, 3, 0, 1)));
            case 6:
                return closureTranslucent(v3(vector(r, 3, 0, 1)));
            default:
                return closureEmission(v3(vector(r, 3, 0, 2)), uniform(r, 0, 10));
        }
    };
    const c = uniform(r, 0, 1) < 0.5 ? one() : closureAdd(one(), one());
    return flat(c);
}

const closureIn = (x: NodeValues, port: string): Closure => unflattenClosure(vec(x[port]));

/** Casos dos nós de espalhamento. */
const bsdfCases: readonly NodeCase[] = [
    {
        node: 'bsdf.diffuse',
        tolerance: 1e-5,
        sample: (r) => ({ color: vector(r, 3, -0.2, 1.2), roughness: uniform(r, -0.2, 1.2) }),
        reference: (x) => ({ value: flat(closureDiffuse(v3(vec(x.color)), num(x.roughness))) }),
    },
    {
        node: 'bsdf.conductor',
        tolerance: 1e-5,
        sample: (r) => ({
            color: vector(r, 3, 0, 1.2),
            edge_tint: vector(r, 3, 0, 1.2),
            roughness: uniform(r, 0, 1),
            anisotropy: uniform(r, -1.5, 1.5),
            tangent: vector(r, 3, -1, 1),
        }),
        reference: (x) => ({
            value: flat(
                closureConductor(
                    v3(vec(x.color)),
                    v3(vec(x.edge_tint)),
                    num(x.roughness),
                    num(x.anisotropy),
                    v3(vec(x.tangent)),
                ),
            ),
        }),
    },
    {
        node: 'bsdf.dielectric',
        tolerance: 1e-5,
        sample: (r) => ({
            ior: uniform(r, 0.8, 2.5),
            tint: vector(r, 3, 0, 1),
            roughness: uniform(r, 0, 1),
            anisotropy: uniform(r, -1, 1),
            tangent: vector(r, 3, -1, 1),
        }),
        reference: (x) => ({
            value: flat(
                closureDielectric(
                    num(x.ior),
                    v3(vec(x.tint)),
                    num(x.roughness),
                    num(x.anisotropy),
                    v3(vec(x.tangent)),
                ),
            ),
        }),
    },
    {
        node: 'bsdf.transmission',
        tolerance: 1e-5,
        sample: (r) => ({
            ior: uniform(r, 1, 2),
            color: vector(r, 3, 0, 1),
            depth: uniform(r, -1, 3),
            abbe: uniform(r, 0, 80),
            roughness: uniform(r, 0, 1),
        }),
        reference: (x) => ({
            value: flat(
                closureTransmission(
                    num(x.ior),
                    v3(vec(x.color)),
                    num(x.depth),
                    num(x.abbe),
                    num(x.roughness),
                ),
            ),
        }),
    },
    {
        node: 'bsdf.translucent',
        tolerance: 1e-5,
        sample: (r) => ({ color: vector(r, 3, 0, 1) }),
        reference: (x) => ({ value: flat(closureTranslucent(v3(vec(x.color)))) }),
    },
    {
        node: 'bsdf.sheen',
        tolerance: 1e-5,
        sample: (r) => ({ color: vector(r, 3, 0, 1), roughness: uniform(r, 0, 1) }),
        reference: (x) => ({ value: flat(closureSheen(v3(vec(x.color)), num(x.roughness))) }),
    },
    {
        node: 'bsdf.subsurface',
        tolerance: 1e-5,
        sample: (r) => ({ color: vector(r, 3, 0, 1), radius: vector(r, 3, 0, 1.2) }),
        reference: (x) => ({ value: flat(closureSubsurface(v3(vec(x.color)), v3(vec(x.radius)))) }),
    },
    {
        node: 'bsdf.emission',
        tolerance: 1e-5,
        sample: (r) => ({ color: vector(r, 3, -0.1, 1), luminance: uniform(r, -1, 100) }),
        reference: (x) => ({ value: flat(closureEmission(v3(vec(x.color)), num(x.luminance))) }),
    },
];

/** Casos dos nós de composição (a regra de fusão). */
const closureCases: readonly NodeCase[] = [
    {
        node: 'closure.mix',
        tolerance: 1e-5,
        sample: (r) => ({ a: randomClosure(r), b: randomClosure(r), t: uniform(r, -0.2, 1.2) }),
        reference: (x) => ({
            value: flat(closureMix(closureIn(x, 'a'), closureIn(x, 'b'), num(x.t))),
        }),
    },
    {
        node: 'closure.add',
        tolerance: 1e-5,
        sample: (r) => ({ a: randomClosure(r), b: randomClosure(r) }),
        reference: (x) => ({ value: flat(closureAdd(closureIn(x, 'a'), closureIn(x, 'b'))) }),
    },
    {
        node: 'closure.layer',
        tolerance: 1e-5,
        sample: (r) => ({
            top: randomClosure(r),
            base: randomClosure(r),
            top_color: vector(r, 3, 0, 1),
            top_weight: uniform(r, 0, 1),
        }),
        reference: (x) => ({
            value: flat(
                closureLayer(
                    closureIn(x, 'top'),
                    closureIn(x, 'base'),
                    v3(vec(x.top_color)),
                    num(x.top_weight),
                ),
            ),
        }),
    },
    {
        node: 'closure.thinFilm',
        tolerance: 1e-5,
        sample: (r) => ({
            c: randomClosure(r),
            thickness: uniform(r, -100, 2500),
            ior: uniform(r, 0.5, 2),
        }),
        reference: (x) => ({
            value: flat(closureThinFilm(closureIn(x, 'c'), num(x.thickness), num(x.ior))),
        }),
    },
    {
        node: 'closure.opacity',
        tolerance: 1e-5,
        sample: (r) => ({ c: randomClosure(r), alpha: uniform(r, -0.2, 1.2) }),
        reference: (x) => ({ value: flat(closureOpacity(closureIn(x, 'c'), num(x.alpha))) }),
    },
    {
        node: 'closure.normal',
        tolerance: 1e-5,
        sample: (r) => ({ c: randomClosure(r), normal: vector(r, 3, -1, 1) }),
        reference: (x) => ({ value: flat(closureNormal(closureIn(x, 'c'), v3(vec(x.normal)))) }),
    },
    {
        node: 'closure.mediumPriority',
        tolerance: 1e-6,
        sample: (r) => ({ c: randomClosure(r), priority: uniform(r, -2, 8) }),
        reference: (x) => ({
            value: flat(closureMediumPriority(closureIn(x, 'c'), num(x.priority))),
        }),
    },
    {
        node: 'closure.thinWalled',
        tolerance: 1e-6,
        sample: (r) => ({ c: randomClosure(r) }),
        reference: (x) => ({ value: flat(closureThinWalled(closureIn(x, 'c'))) }),
    },
    {
        node: 'output.closure',
        tolerance: 1e-6,
        sample: (r) => ({ closure: randomClosure(r) }),
        reference: (x) => ({ value: vec(x.closure) }),
    },
];

/** HSV → RGB (matiz em voltas), a do nó. */
function hsv(h: number, s: number, v: number): number[] {
    const k = [1, 2 / 3, 1 / 3];
    const sat = Math.min(Math.max(s, 0), 1);
    return k.map((kk) => {
        const f = h + kk;
        const p = Math.abs((f - Math.floor(f)) * 6 - 3);
        return v * (1 + (Math.min(Math.max(p - 1, 0), 1) - 1) * sat);
    });
}

/** Temperatura de cor (K) → RGB linear normalizado (ajuste de Tanner Helland), a do nó. */
function temperature(kelvin: number): number[] {
    const t = Math.min(Math.max(kelvin, 1000), 40000) / 100;
    const c01 = (x: number): number => Math.min(Math.max(x, 0), 1);
    let rgb: number[];
    if (t <= 66) {
        rgb = [
            1,
            c01((99.4708025861 * Math.log(t) - 161.1195681661) / 255),
            t <= 19 ? 0 : c01((138.5177312231 * Math.log(t - 10) - 305.0447927307) / 255),
        ];
    } else {
        rgb = [
            c01((329.698727446 * Math.pow(t - 60, -0.1332047592)) / 255),
            c01((288.1221695283 * Math.pow(t - 60, -0.0755148492)) / 255),
            1,
        ];
    }
    const lin = rgb.map(srgbDecode);
    const m = Math.max(...lin);
    return lin.map((c) => c / m);
}

/** Casos dos nós de cor da 011. */
const colorCases: readonly NodeCase[] = [
    {
        node: 'color.rgb',
        tolerance: 1e-6,
        sample: (r) => ({ r: uniform(r, -1, 2), g: uniform(r, -1, 2), b: uniform(r, -1, 2) }),
        reference: (x) => ({ value: [num(x.r), num(x.g), num(x.b)] }),
    },
    {
        node: 'color.hsv',
        tolerance: 1e-5,
        sample: (r) => ({ h: uniform(r, -1, 2), s: uniform(r, -0.2, 1.2), v: uniform(r, 0, 2) }),
        reference: (x) => ({ value: hsv(num(x.h), num(x.s), num(x.v)) }),
    },
    {
        node: 'color.temperature',
        tolerance: 2e-3,
        sample: (r) => ({ kelvin: uniform(r, 500, 45000) }),
        reference: (x) => ({ value: temperature(num(x.kelvin)) }),
    },
    {
        node: 'color.luminance',
        tolerance: 1e-6,
        sample: (r) => ({ c: vector(r, 3, 0, 4) }),
        reference: (x) => {
            const c = vec(x.c);
            return { value: luminance([c[0]!, c[1]!, c[2]!]) };
        },
    },
];

/**
 * Caso do nó de tangente pelo uv: derivadas de tela só existem no fragmento, então a GPU o avalia no smoke `materials`
 * (anisotropia girando com a tangente); aqui a referência é a de uv sem variação — a direção estável da normal.
 */
const geometryCases: readonly NodeCase[] = [
    {
        node: 'geometry.tangentUv',
        tolerance: 1e-5,
        derivatives: true,
        sample: (r) => ({
            position: vector(r, 3, -1, 1),
            normal: [0, 0, 1],
            uv: vector(r, 2, 0, 1),
        }),
        reference: (x) => {
            const n = vec(x.normal);
            const s = n[2]! >= 0 ? 1 : -1;
            const a = -1 / (s + n[2]!);
            return { value: [1 + s * n[0]! * n[0]! * a, s * n[0]! * n[1]! * a, -s * n[0]!] };
        },
    },
];

/** Casos de todos os nós de material da 011. */
export const materialCases: readonly NodeCase[] = [
    ...bsdfCases,
    ...closureCases,
    ...colorCases,
    ...geometryCases,
];
