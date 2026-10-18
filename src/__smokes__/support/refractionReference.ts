// Referência analítica da refração (spec 034, US1, SC-002): traçado de Whitted na CPU por objetos de vidro (esfera,
// caixa, cilindro com tampas), com Snell, Fresnel exato não polarizado, reflexão interna total, Beer-Lambert por meio e
// dispersão por canal (Abbe, como `closure_dispersion_iors`), diante do painel xadrez emissivo das cenas
// (`refractionScenes.ts`). Sem luzes nem céu: o que o raio não acha é preto. Pura (sem o motor): testada na CPU.

export type Vec3 = readonly [number, number, number];

/** Meio de um objeto: IOR, cor atingida a `depth` m de percurso (0 = sem absorção) e Abbe (0 = sem dispersão). */
export interface Medium {
    readonly ior: number;
    readonly color?: Vec3;
    readonly depth?: number;
    readonly abbe?: number;
}

export type Shape =
    | { readonly kind: 'sphere'; readonly center: Vec3; readonly radius: number }
    | { readonly kind: 'box'; readonly min: Vec3; readonly max: Vec3 }
    /** Cilindro de eixo y. */
    | {
          readonly kind: 'cylinder';
          readonly center: Vec3;
          readonly radius: number;
          readonly halfHeight: number;
      };

export interface RefractiveObject {
    readonly shape: Shape;
    readonly medium: Medium;
}

/** Painel emissivo xadrez no plano z = `z` (normal +z), casas de `cell`, luminâncias clara e escura. */
export interface Panel {
    readonly z: number;
    readonly cell: number;
    readonly half: number;
    readonly bright: number;
    readonly dark: number;
}

export interface RefractionScene {
    readonly objects: readonly RefractiveObject[];
    readonly panel: Panel;
    /** Objetos opacos emissivos (cor constante) — o que está fora do quadro ou encoberto. */
    readonly emitters?: readonly { readonly shape: Shape; readonly radiance: Vec3 }[];
}

const EPS = 1e-5;
const MAX_DEPTH = 16;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3): Vec3 => scale(a, 1 / Math.hypot(a[0], a[1], a[2]));

/** IOR do canal `k` (0 vermelho, 1 verde, 2 azul). */
export function channelIor(m: Medium, k: number): number {
    const abbe = m.abbe ?? 0;
    const d = abbe > 0 ? (m.ior - 1) / Math.max(abbe, 10) : 0;
    return m.ior + d * [-0.5, 0, 0.5][k]!;
}

/** Fresnel exato não polarizado de n1 para n2 com o cosseno de incidência `cosi` (> 0). */
export function fresnel(n1: number, n2: number, cosi: number): number {
    const eta = n1 / n2;
    const sin2t = eta * eta * (1 - cosi * cosi);
    if (sin2t >= 1) return 1;
    const cost = Math.sqrt(1 - sin2t);
    const rs = (n1 * cosi - n2 * cost) / (n1 * cosi + n2 * cost);
    const rp = (n1 * cost - n2 * cosi) / (n1 * cost + n2 * cosi);
    return 0.5 * (rs * rs + rp * rp);
}

interface ShapeHit {
    readonly t: number;
    /** Normal para fora da forma. */
    readonly n: Vec3;
}

/** Interseções do raio com a forma (todas, t > EPS, em ordem). */
function intersect(shape: Shape, o: Vec3, d: Vec3): ShapeHit[] {
    const out: ShapeHit[] = [];
    if (shape.kind === 'sphere') {
        const oc: Vec3 = [o[0] - shape.center[0], o[1] - shape.center[1], o[2] - shape.center[2]];
        const b = dot(oc, d);
        const c = dot(oc, oc) - shape.radius * shape.radius;
        const disc = b * b - c;
        if (disc < 0) return out;
        const s = Math.sqrt(disc);
        for (const t of [-b - s, -b + s])
            if (t > EPS) out.push({ t, n: scale(add(oc, scale(d, t)), 1 / shape.radius) });
        return out;
    }
    if (shape.kind === 'box') {
        let t0 = -Infinity;
        let t1 = Infinity;
        let n0: Vec3 = [0, 0, 0];
        let n1: Vec3 = [0, 0, 0];
        for (let a = 0; a < 3; a++) {
            if (Math.abs(d[a]!) < 1e-12) {
                if (o[a]! < shape.min[a]! || o[a]! > shape.max[a]!) return out;
                continue;
            }
            let ta = (shape.min[a]! - o[a]!) / d[a]!;
            let tb = (shape.max[a]! - o[a]!) / d[a]!;
            let na = -1;
            if (ta > tb) {
                [ta, tb] = [tb, ta];
                na = 1;
            }
            const axis = (sgn: number): Vec3 => [
                a === 0 ? sgn : 0,
                a === 1 ? sgn : 0,
                a === 2 ? sgn : 0,
            ];
            if (ta > t0) {
                t0 = ta;
                n0 = axis(na);
            }
            if (tb < t1) {
                t1 = tb;
                n1 = axis(-na);
            }
        }
        if (t0 > t1) return out;
        if (t0 > EPS) out.push({ t: t0, n: n0 });
        if (t1 > EPS) out.push({ t: t1, n: n1 });
        return out;
    }
    // Cilindro de eixo y com tampas.
    const ox = o[0] - shape.center[0];
    const oz = o[2] - shape.center[2];
    const oy = o[1] - shape.center[1];
    const a = d[0] * d[0] + d[2] * d[2];
    const cands: ShapeHit[] = [];
    if (a > 1e-12) {
        const b = ox * d[0] + oz * d[2];
        const c = ox * ox + oz * oz - shape.radius * shape.radius;
        const disc = b * b - a * c;
        if (disc >= 0) {
            const s = Math.sqrt(disc);
            for (const t of [(-b - s) / a, (-b + s) / a]) {
                const y = oy + d[1] * t;
                if (Math.abs(y) <= shape.halfHeight)
                    cands.push({ t, n: norm([ox + d[0] * t, 0, oz + d[2] * t]) });
            }
        }
    }
    if (Math.abs(d[1]) > 1e-12)
        for (const sgn of [-1, 1]) {
            const t = (sgn * shape.halfHeight - oy) / d[1];
            const x = ox + d[0] * t;
            const z = oz + d[2] * t;
            if (x * x + z * z <= shape.radius * shape.radius) cands.push({ t, n: [0, sgn, 0] });
        }
    return cands.filter((h) => h.t > EPS).sort((p, q) => p.t - q.t);
}

/** Radiância (por canal `k`) do painel no ponto dado. */
function panelRadiance(p: Panel, x: number, y: number): number {
    if (Math.abs(x) > p.half || Math.abs(y) > p.half) return 0;
    return (Math.floor(x / p.cell) + Math.floor(y / p.cell)) % 2 === 0 ? p.bright : p.dark;
}

/**
 * Radiância no canal `k` ao longo do raio (origem `o`, direção unitária `d`), começando no meio `inside` (índices de
 * objetos, do mais externo ao mais interno).
 */
export function traceChannel(
    scene: RefractionScene,
    o: Vec3,
    d: Vec3,
    k: number,
    inside: readonly number[] = [],
    depth = 0,
    weight = 1,
): number {
    // Ramo sem peso (as reflexões internas repetidas): sem contribuição mensurável.
    if (depth > MAX_DEPTH || weight < 1e-4) return 0;
    // O acerto mais próximo: objetos de vidro, emissores, painel.
    let best = Infinity;
    let hitObj = -1;
    let hitN: Vec3 = [0, 0, 0];
    scene.objects.forEach((obj, i) => {
        const h = intersect(obj.shape, o, d)[0];
        if (h !== undefined && h.t < best) {
            best = h.t;
            hitObj = i;
            hitN = h.n;
        }
    });
    let emit = -1;
    (scene.emitters ?? []).forEach((e, i) => {
        const h = intersect(e.shape, o, d)[0];
        if (h !== undefined && h.t < best) {
            best = h.t;
            emit = i;
            hitObj = -1;
        }
    });
    let panelHit = false;
    if (d[2] < 0) {
        const t = (scene.panel.z - o[2]) / d[2];
        if (t > EPS && t < best) {
            best = t;
            panelHit = true;
            hitObj = -1;
            emit = -1;
        }
    }
    // Absorção do meio atual pelo trecho.
    const current =
        inside.length > 0 ? scene.objects[inside[inside.length - 1]!]!.medium : undefined;
    const absorb = (dist: number): number => {
        if (current === undefined || (current.depth ?? 0) <= 0 || !Number.isFinite(dist)) return 1;
        const c = Math.max(current.color?.[k] ?? 1, 1e-4);
        return Math.pow(c, dist / current.depth!);
    };
    if (!Number.isFinite(best)) return 0;
    const att = absorb(best);
    const p = add(o, scale(d, best));
    if (panelHit) return att * panelRadiance(scene.panel, p[0], p[1]);
    if (emit >= 0) return att * scene.emitters![emit]!.radiance[k]!;
    // Interface de vidro: entrando (normal contra o raio) ou saindo.
    const entering = dot(hitN, d) < 0;
    const n = entering ? hitN : scale(hitN, -1);
    const cosi = -dot(n, d);
    const n1 = current === undefined ? 1 : channelIor(current, k);
    const nextInside = entering ? [...inside, hitObj] : inside.filter((i) => i !== hitObj);
    const next =
        nextInside.length > 0
            ? scene.objects[nextInside[nextInside.length - 1]!]!.medium
            : undefined;
    const n2 = next === undefined ? 1 : channelIor(next, k);
    const f = fresnel(n1, n2, cosi);
    const reflDir = norm(add(d, scale(n, 2 * cosi)));
    const off = (dir: Vec3): Vec3 => add(p, scale(dir, 1e-4));
    let radiance =
        f * traceChannel(scene, off(reflDir), reflDir, k, inside, depth + 1, weight * f * att);
    if (f < 1) {
        const eta = n1 / n2;
        const cost = Math.sqrt(1 - eta * eta * (1 - cosi * cosi));
        const tDir = norm(add(scale(d, eta), scale(n, eta * cosi - cost)));
        radiance +=
            (1 - f)
            * traceChannel(
                scene,
                off(tDir),
                tDir,
                k,
                nextInside,
                depth + 1,
                weight * (1 - f) * att,
            );
    }
    return att * radiance;
}

/** Radiância RGB ao longo do raio (um traçado por canal). */
export function traceRgb(scene: RefractionScene, o: Vec3, d: Vec3): Vec3 {
    return [
        traceChannel(scene, o, d, 0),
        traceChannel(scene, o, d, 1),
        traceChannel(scene, o, d, 2),
    ];
}

/** Câmera em perspectiva olhando para −z de `eye`, campo vertical `fov`, imagem `w`×`h`. */
export interface PinholeCamera {
    readonly eye: Vec3;
    readonly fov: number;
    readonly width: number;
    readonly height: number;
}

/** Raio pelo ponto (x + 0,5 + dx, y + 0,5 + dy) do pixel (x, y), y de cima para baixo. */
export function pixelRay(
    cam: PinholeCamera,
    x: number,
    y: number,
    dx = 0,
    dy = 0,
): { o: Vec3; d: Vec3 } {
    const t = Math.tan(cam.fov / 2);
    const aspect = cam.width / cam.height;
    const u = ((2 * (x + 0.5 + dx)) / cam.width - 1) * t * aspect;
    const v = (1 - (2 * (y + 0.5 + dy)) / cam.height) * t;
    return { o: cam.eye, d: norm([u, v, -1]) };
}

/**
 * As amostras do antisserrilhado da refração do motor (spec 034): o centro e três pontos a 120° num raio de 0,35 px —
 * as de `refraction_sample_offset`.
 */
export const PIXEL_SAMPLES: readonly (readonly [number, number])[] = [
    [0, 0],
    ...[1, 2, 3].map((s) => {
        const a = (s - 1) * ((2 * Math.PI) / 3) + Math.PI / 6;
        return [0.35 * Math.cos(a), 0.35 * Math.sin(a)] as const;
    }),
];

/** Imagem de referência (rgb linear por pixel, a média das amostras do pixel, linhas de cima para baixo). */
export function renderReference(
    scene: RefractionScene,
    cam: PinholeCamera,
    samples: readonly (readonly [number, number])[] = PIXEL_SAMPLES,
): Float32Array {
    const out = new Float32Array(cam.width * cam.height * 3);
    for (let y = 0; y < cam.height; y++)
        for (let x = 0; x < cam.width; x++) {
            const sum = [0, 0, 0];
            for (const [dx, dy] of samples) {
                const { o, d } = pixelRay(cam, x, y, dx, dy);
                const c = traceRgb(scene, o, d);
                for (let k = 0; k < 3; k++) sum[k]! += c[k]! / samples.length;
            }
            out.set(sum, (y * cam.width + x) * 3);
        }
    return out;
}

/** Luminância (Rec. 709) de uma imagem rgb ou rgba linear. */
export function luminance(
    data: Float32Array,
    width: number,
    height: number,
    channels: 3 | 4,
): Float32Array {
    const out = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++)
        out[i] =
            0.2126 * data[i * channels]!
            + 0.7152 * data[i * channels + 1]!
            + 0.0722 * data[i * channels + 2]!;
    return out;
}

/**
 * Degraus ao longo das bordas (spec 034, SC-001): em cada pixel de borda (gradiente de Sobel acima de `threshold` ×
 * `contrast`, dentro de `mask`), a maior diferença de luminância para os vizinhos a um pixel na direção da borda
 * (perpendicular ao gradiente, por interpolação bilinear), dividida por `contrast`. Uma borda lisa varia pouco ao longo
 * dela; uma em degraus salta o contraste inteiro. Devolve o percentil 99 e quantos pixels de borda entraram.
 */
export function edgeSteps(
    lum: Float32Array,
    width: number,
    height: number,
    contrast: number,
    mask: (x: number, y: number) => boolean = () => true,
    threshold = 0.25,
): { p99: number; count: number } {
    const at = (x: number, y: number): number =>
        lum[Math.min(Math.max(y, 0), height - 1) * width + Math.min(Math.max(x, 0), width - 1)]!;
    const bilinear = (x: number, y: number): number => {
        const x0 = Math.floor(x);
        const y0 = Math.floor(y);
        const fx = x - x0;
        const fy = y - y0;
        return (
            (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy)
            + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
        );
    };
    const steps: number[] = [];
    for (let y = 1; y < height - 1; y++)
        for (let x = 1; x < width - 1; x++) {
            if (!mask(x, y)) continue;
            const gx =
                at(x + 1, y - 1)
                + 2 * at(x + 1, y)
                + at(x + 1, y + 1)
                - (at(x - 1, y - 1) + 2 * at(x - 1, y) + at(x - 1, y + 1));
            const gy =
                at(x - 1, y + 1)
                + 2 * at(x, y + 1)
                + at(x + 1, y + 1)
                - (at(x - 1, y - 1) + 2 * at(x, y - 1) + at(x + 1, y - 1));
            const g = Math.hypot(gx, gy) / 8;
            if (g < threshold * contrast) continue;
            const tx = -gy / (8 * g);
            const ty = gx / (8 * g);
            const c = at(x, y);
            steps.push(
                Math.max(
                    Math.abs(bilinear(x + tx, y + ty) - c),
                    Math.abs(bilinear(x - tx, y - ty) - c),
                ) / contrast,
            );
        }
    if (steps.length === 0) return { p99: 0, count: 0 };
    steps.sort((a, b) => a - b);
    return {
        p99: steps[Math.min(steps.length - 1, Math.floor(steps.length * 0.99))]!,
        count: steps.length,
    };
}
