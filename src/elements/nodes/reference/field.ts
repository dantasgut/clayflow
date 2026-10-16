// Referência da CPU do nó de amostragem do campo da cena (spec 031, R12): os campos prontos (`field_builtin.wgsl`, os
// registros do pool `FieldBuiltinRecord`) em f64 — no kernel de teste o `field_accel` é o pronto. Tolerância 1e-4
// (`|gpu − ref| ≤ tol · max(1, |ref|)`): `inverseSqrt`, `exp` e o ruído de valor do vento em f32.
import {
    FIELD_BUOYANCY,
    FIELD_DRAG,
    FIELD_GRAVITY_POINT,
    FIELD_VORTEX,
    FIELD_WIND,
} from '../../gpu/shaders/constants';
import { num, uniform, vec, vector, type NodeCase, type NodeValues } from './cases';
import { valueNoise3 } from './noise';

type V = readonly number[];

const dot = (a: V, b: V): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;

/** Um registro de campo pronto: código de tipo e os vetores `a`, `b`, `s`. */
export interface FieldRecord {
    readonly kind: number;
    readonly a: V;
    readonly b: V;
    readonly s: V;
}

/** `field_builtin`: a soma das acelerações dos registros sobre um corpo de densidade `density`. */
export function fieldBuiltin(
    records: readonly FieldRecord[],
    x: V,
    v: V,
    time: number,
    density: number,
): number[] {
    const acc = [0, 0, 0];
    const add = (w: V): void => {
        for (let k = 0; k < 3; k++) acc[k] = acc[k]! + w[k]!;
    };
    for (const { kind, a, b, s } of records) {
        if (kind === FIELD_GRAVITY_POINT.value) {
            const d = [a[0]! - x[0]!, a[1]! - x[1]!, a[2]! - x[2]!];
            const r2 = Math.max(dot(d, d), Math.max(s[1]!, 1e-8));
            add(d.map((c) => (s[0]! * c) / Math.sqrt(r2) / r2));
        } else if (kind === FIELD_WIND.value) {
            const gust = valueNoise3(
                x[0]! * s[1]! + time * 0.7,
                x[1]! * s[1]! + time * 0.3,
                x[2]! * s[1]! - time * 0.5,
            );
            add([0, 1, 2].map((k) => a[k]! * (1 + s[0]! * gust)));
        } else if (kind === FIELD_VORTEX.value) {
            const rel = [x[0]! - b[0]!, x[1]! - b[1]!, x[2]! - b[2]!];
            const along = dot(rel, a);
            const radial = rel.map((c, k) => c - a[k]! * along);
            const d = Math.hypot(radial[0]!, radial[1]!, radial[2]!);
            if (d > 1e-6) {
                const u = radial.map((c) => c / d);
                const c = [
                    a[1]! * u[2]! - a[2]! * u[1]!,
                    a[2]! * u[0]! - a[0]! * u[2]!,
                    a[0]! * u[1]! - a[1]! * u[0]!,
                ];
                const m = s[0]! * Math.exp(-s[1]! * d);
                add(c.map((q) => q * m));
            }
        } else if (kind === FIELD_DRAG.value) {
            const k = s[0]! + s[1]! * Math.hypot(v[0]!, v[1]!, v[2]!);
            add(v.map((c) => -k * c));
        } else if (kind === FIELD_BUOYANCY.value) {
            if (x[1]! < s[1]! && density > 0) add([0, (s[2]! * s[0]!) / density, 0]);
        }
    }
    return acc;
}

/** Os registros do caso de teste: um de cada campo pronto. */
const FIELD_RECORDS: readonly FieldRecord[] = [
    { kind: FIELD_GRAVITY_POINT.value, a: [0.5, -0.25, 1, 0], b: [0, 0, 0, 0], s: [3, 0.05, 0, 0] },
    { kind: FIELD_WIND.value, a: [1.5, 0, -0.5, 0], b: [0, 0, 0, 0], s: [0.6, 0.5, 0, 0] },
    {
        kind: FIELD_VORTEX.value,
        a: [0, 1, 0, 0],
        b: [0.25, 0, -0.5, 0],
        s: [2, 0.4, 0, 0],
    },
    { kind: FIELD_DRAG.value, a: [0, 0, 0, 0], b: [0, 0, 0, 0], s: [0.3, 0.1, 0, 0] },
    { kind: FIELD_BUOYANCY.value, a: [0, 0, 0, 0], b: [0, 0, 0, 0], s: [1000, 0.5, 9.81, 0] },
];

/** Casos do nó `field.sample`. */
export const fieldCases: readonly NodeCase[] = [
    {
        node: 'field.sample',
        tolerance: 1e-4,
        sample: (r) => ({
            x: vector(r, 3, -3, 3),
            v: vector(r, 3, -2, 2),
            time: uniform(r, 0, 10),
            inv_mass: uniform(r, 0.1, 2),
            density: uniform(r, 0, 2000),
            volume: uniform(r, 0, 1),
        }),
        reference: (x: NodeValues) => ({
            value: fieldBuiltin(FIELD_RECORDS, vec(x.x), vec(x.v), num(x.time), num(x.density)),
        }),
        scene: {
            resource: 'field_builtin_records',
            records: FIELD_RECORDS.map((rec) => ({
                kind: rec.kind,
                a: rec.a,
                b: rec.b,
                s: rec.s,
            })),
        },
    },
];
