// Referência f64 da película de água nos sólidos (spec 034, T066d): a leitura dela no plano da superfície (a B-spline
// quadrática das 3 × 3 células, `field_film_sample`), a pressão do espalhamento (`field_film_pressure_main`) e a normal
// que a refração vê pela cunha de água sobre o sólido (`refraction_wet_normal`). As mesmas contas do WGSL, em f64.

/** Os pesos da B-spline quadrática nas células −1, 0 e 1 para o deslocamento `f` ∈ [−½, ½) ao centro mais próximo. */
export function filmWeights(f: number): [number, number, number] {
    return [0.5 * (0.5 - f) ** 2, 0.75 - f * f, 0.5 * (0.5 + f) ** 2];
}

/** As derivadas dos pesos (por célula). */
export function filmWeightSlopes(f: number): [number, number, number] {
    return [f - 0.5, -2 * f, 0.5 + f];
}

/**
 * A película lida no ponto (u, v) do plano (em células; os centros nos inteiros + ½) da grade `h(i, j)` (a água livre
 * de cada célula, 0 na seca): a espessura e o gradiente dela (por célula).
 */
export function filmSample(
    h: (i: number, j: number) => number,
    u: number,
    v: number,
): { value: number; slope: [number, number] } {
    const gu = u - 0.5;
    const gv = v - 0.5;
    const cu = Math.round(gu);
    const cv = Math.round(gv);
    const wu = filmWeights(gu - cu);
    const wv = filmWeights(gv - cv);
    const du = filmWeightSlopes(gu - cu);
    const dv = filmWeightSlopes(gv - cv);
    let value = 0;
    let su = 0;
    let sv = 0;
    for (let b = 0; b < 3; b++)
        for (let a = 0; a < 3; a++) {
            const x = h(cu + a - 1, cv + b - 1);
            value += wu[a]! * wv[b]! * x;
            su += du[a]! * wv[b]! * x;
            sv += wu[a]! * dv[b]! * x;
        }
    return { value, slope: [su, sv] };
}

/**
 * Pressão da película sobre a densidade (m²/s²): o peso da coluna na face voltada para cima e a de Laplace pelas quatro
 * vizinhas do plano (a seca conta como a própria célula: sem fluxo pela linha de contato).
 */
export function filmPressure(
    h: number,
    around: readonly (number | undefined)[],
    gn: number,
    tensionPerDensity: number,
    cell: number,
): number {
    const sum = around.reduce<number>((a, x) => a + (x === undefined ? h : x), 0);
    return Math.max(gn, 0) * h - (tensionPerDensity * (sum - 4 * h)) / (cell * cell);
}

type Vec3 = readonly [number, number, number];

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalize = (a: Vec3): [number, number, number] => {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
};

/** Índice de refração da água da película. */
export const FILM_IOR = 1.333;

/**
 * A normal de sombreamento `ns` com a película de inclinação `slope` (∇h no plano) sobre o sólido de normal de fora
 * `n` e índice `ior`: n − ∇h é a face de fora da água; a cunha fina desvia como a interface do sólido inclinada
 * (1,333 − 1) / (ior − 1) vezes isso (a primeira ordem).
 */
export function wetNormal(ns: Vec3, n: Vec3, slope: Vec3, ior: number): [number, number, number] {
    if (dot(slope, slope) <= 0) return [ns[0], ns[1], ns[2]];
    const k = (FILM_IOR - 1) / Math.max(ior - 1, 0.05);
    const side = dot(ns, n) >= 0 ? 1 : -1;
    return normalize([
        ns[0] - side * k * slope[0],
        ns[1] - side * k * slope[1],
        ns[2] - side * k * slope[2],
    ]);
}

/** Refração de `d` (unitário) na interface de normal `n` (voltada para o lado de `d`… contra ele), razão η = n1 / n2. */
export function refract(d: Vec3, n: Vec3, eta: number): [number, number, number] | undefined {
    const c = -dot(d, n);
    const k = 1 - eta * eta * (1 - c * c);
    if (k < 0) return undefined;
    const t = eta * c - Math.sqrt(k);
    return normalize([eta * d[0] + t * n[0], eta * d[1] + t * n[1], eta * d[2] + t * n[2]]);
}
