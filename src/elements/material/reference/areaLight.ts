import { type Vec3 } from './bsdf';

// Referência em CPU da luz de área retangular (spec 011, R19): a mesma quadratura do módulo WGSL `closure_area` — a
// integral de um lobo sobre o retângulo emissor, sem sorteio. O lobo especular parte o retângulo pelas células de uma
// grade polar no plano das inclinações da micronormal (os anéis de massa igual da GGX); cada célula, refletida, cai no
// plano da luz como um quadrilátero, e o que dele está dentro do retângulo entra com o integrando exato na direção do
// meio desse pedaço. Os lobos largos (o difuso) usam os 4 × 4 pontos de Gauss-Legendre do retângulo.

/** O retângulo emissor: o centro, os dois eixos unitários, a normal (o lado que emite) e as meias medidas. */
export interface AreaRect {
    readonly center: Vec3;
    readonly ax: Vec3;
    readonly ay: Vec3;
    readonly normal: Vec3;
    readonly half: readonly [number, number];
}

/** As bordas dos anéis na massa acumulada da GGX (u = r² / (1 + r²), r a inclinação em unidades de α). */
export const AREA_RINGS = [0, 0.2, 0.45, 0.7, 0.88, 0.97] as const;
/** Os raios de cada anel. */
export const AREA_SPOKES = 8;
/** Os nós e os pesos de Gauss-Legendre de 4 pontos em [-1, 1]. */
export const AREA_GAUSS = [
    [-0.8611363116, 0.3478548451],
    [-0.3399810436, 0.6521451549],
    [0.3399810436, 0.6521451549],
    [0.8611363116, 0.3478548451],
] as const;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mad = (a: Vec3, b: Vec3, s: number): Vec3 => [
    a[0] + b[0] * s,
    a[1] + b[1] * s,
    a[2] + b[2] * s,
];
const unit = (a: Vec3): Vec3 => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** O ângulo sólido, visto de `p`, do pedaço de área `area` do retângulo em volta do ponto (x, y) dele, e a direção. */
function piece(rect: AreaRect, p: Vec3, x: number, y: number, area: number): [Vec3, number] {
    const d = sub(mad(mad(rect.center, rect.ax, x), rect.ay, y), p);
    const dist2 = Math.max(dot(d, d), 1e-12);
    const l = unit(d);
    return [l, (area * Math.max(-dot(l, rect.normal), 0)) / dist2];
}

type Vec2 = readonly [number, number];

/** A área (com sinal) e o centroide de um polígono. */
function centroid(poly: readonly Vec2[]): [number, number, number] {
    let area = 0;
    let cx = 0;
    let cy = 0;
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i]!;
        const b = poly[(i + 1) % poly.length]!;
        const w = a[0] * b[1] - b[0] * a[1];
        area += w;
        cx += (a[0] + b[0]) * w;
        cy += (a[1] + b[1]) * w;
    }
    if (Math.abs(area) < 1e-30) return [0, 0, 0];
    return [0.5 * area, cx / (3 * area), cy / (3 * area)];
}

/** O polígono recortado pelo retângulo de meias medidas `half` centrado na origem (Sutherland-Hodgman, até 8 vértices). */
function clip(poly: readonly Vec2[], half: Vec2): Vec2[] {
    let cur = [...poly];
    for (let e = 0; e < 4 && cur.length >= 3; e++) {
        const axis = e >> 1;
        const sign = (e & 1) === 0 ? 1 : -1;
        const out: Vec2[] = [];
        for (let i = 0; i < cur.length; i++) {
            const a = cur[i]!;
            const b = cur[(i + 1) % cur.length]!;
            const da = half[axis]! + sign * a[axis]!;
            const db = half[axis]! + sign * b[axis]!;
            if (da >= 0 && out.length < 8) out.push(a);
            if (da >= 0 !== db >= 0 && out.length < 8) {
                const k = da / (da - db);
                out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
            }
        }
        cur = out;
    }
    return cur.length >= 3 ? cur : [];
}

/**
 * ∫ f(l) dω sobre o retângulo visto de `p`, com `f` um lobo especular GGX em volta da direção refletida: `v` a direção
 * para quem vê, `m` a normal do lobo, `t` a tangente (unitária, perpendicular a `m`) e `at`, `ab` os α ao longo da
 * tangente e da bitangente. `f` devolve o integrando (a BSDF vezes o cosseno) na direção `l`.
 */
export function areaLobe(
    rect: AreaRect,
    p: Vec3,
    v: Vec3,
    m: Vec3,
    t: Vec3,
    at: number,
    ab: number,
    f: (l: Vec3) => number,
): number {
    const b: Vec3 = [
        m[1] * t[2] - m[2] * t[1],
        m[2] * t[0] - m[0] * t[2],
        m[0] * t[1] - m[1] * t[0],
    ];
    const height = dot(sub(p, rect.center), rect.normal);
    if (height <= 0) return 0;
    // A densidade do lobo na direção `l`, por ângulo sólido: D(h) · (m·h) / (4 · v·h).
    const pdf = (l: Vec3): number => {
        const h = unit([v[0] + l[0], v[1] + l[1], v[2] + l[2]]);
        const x = dot(t, h) / at;
        const y = dot(b, h) / ab;
        const z = dot(m, h);
        const d = x * x + y * y + z * z;
        return z / (Math.PI * at * ab * d * d * 4 * Math.max(dot(v, h), 1e-6));
    };
    let prev: (Vec2 | undefined)[] = [];
    let sum = 0;
    for (let k = 0; k < AREA_RINGS.length; k++) {
        const u = AREA_RINGS[k]!;
        const r = Math.sqrt(u / (1 - u));
        const cur: (Vec2 | undefined)[] = [];
        for (let j = 0; j < AREA_SPOKES; j++) {
            const phi = (2 * Math.PI * j) / AREA_SPOKES;
            const h = unit(mad(mad(m, t, r * at * Math.cos(phi)), b, r * ab * Math.sin(phi)));
            const l = mad([-v[0], -v[1], -v[2]], h, 2 * dot(v, h));
            const down = dot(l, rect.normal);
            if (down > -0.02) {
                cur.push(undefined);
                continue;
            }
            const q = sub(mad(p, l, -height / down), rect.center);
            cur.push([dot(q, rect.ax), dot(q, rect.ay)]);
        }
        if (k > 0) {
            const mass = (u - AREA_RINGS[k - 1]!) / AREA_SPOKES;
            for (let j = 0; j < AREA_SPOKES; j++) {
                const j1 = (j + 1) % AREA_SPOKES;
                const qa = prev[j];
                const qb = prev[j1];
                const qc = cur[j1];
                const qd = cur[j];
                if (qa === undefined || qb === undefined || qc === undefined || qd === undefined)
                    continue;
                const cell = [qa, qb, qc, qd];
                const whole = centroid(cell);
                const part = centroid(clip(cell, rect.half));
                const inside = whole[0] === 0 ? 0 : Math.min(part[0] / whole[0], 1);
                if (inside <= 0) continue;
                // A célula inteira e o pedaço dela dentro do retângulo: o integrando no meio do pedaço vezes o
                // ângulo sólido dele; com a célula quase toda dentro, a massa exata dela no lugar da área (a
                // densidade do lobo no meio da célula): o lobo estreito não perde a energia do pico.
                const [l, w] = piece(rect, p, part[1], part[2], Math.abs(part[0]));
                const [lc, wc] = piece(rect, p, whole[1], whole[2], Math.abs(whole[0]));
                const density = pdf(lc) * wc;
                const exact = Math.min(Math.max(density > 0 ? mass / density : 1, 0.5), 2);
                sum += f(l) * w * (1 + (exact - 1) * inside * inside);
            }
        }
        prev = cur;
    }
    return sum;
}

/**
 * O lobo especular de α (`at`, `ab`) é largo diante do retângulo visto de `p`? — o menor α passa de 0,35 da meia
 * diagonal do retângulo sobre a distância: a soma nos pontos de Gauss (`areaWide`) vale pela grade do lobo.
 */
export function areaIsWide(rect: AreaRect, p: Vec3, at: number, ab: number): boolean {
    const d = sub(rect.center, p);
    return (
        Math.min(at, ab) * Math.hypot(d[0], d[1], d[2])
        > 0.35 * Math.hypot(rect.half[0], rect.half[1])
    );
}

/** ∫ f(l) dω sobre o retângulo visto de `p`, para um lobo largo (o difuso): 4 × 4 pontos de Gauss-Legendre. */
export function areaWide(rect: AreaRect, p: Vec3, f: (l: Vec3) => number): number {
    let sum = 0;
    const area = rect.half[0] * rect.half[1];
    for (const [x, wx] of AREA_GAUSS) {
        for (const [y, wy] of AREA_GAUSS) {
            const [l, omega] = piece(rect, p, x * rect.half[0], y * rect.half[1], wx * wy * area);
            sum += f(l) * omega;
        }
    }
    return sum;
}

/** A mesma integral pela regra do ponto médio em `n` × `n` pedaços (a conta de referência dos testes). */
export function areaExact(rect: AreaRect, p: Vec3, f: (l: Vec3) => number, n = 256): number {
    let sum = 0;
    const area = (4 * rect.half[0] * rect.half[1]) / (n * n);
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const x = (((i + 0.5) / n) * 2 - 1) * rect.half[0];
            const y = (((j + 0.5) / n) * 2 - 1) * rect.half[1];
            const [l, omega] = piece(rect, p, x, y, area);
            sum += f(l) * omega;
        }
    }
    return sum;
}
