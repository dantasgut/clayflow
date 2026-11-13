// Referência f64 da película de água nos sólidos (spec 034, T066d): a leitura dela no plano da superfície (a B-spline
// quadrática das 3 × 3 células, `field_film_sample`), a pressão do espalhamento (`field_film_pressure_main`), a normal
// que a refração vê pela cunha de água sobre o sólido (`refraction_wet_normal`), a cobertura do disco do contato na
// deposição (`field_film_coverage`), a gota que desliza passada à película (`field_film_absorb_main`) e as gotas em que a
// película fina se rompe (`field_film_breaks`, os sítios das gotas de `field_film_cell_drops`), a velocidade com que a água
// desce (`field_film_flow`: a película de Nusselt freada pela linha de contato) e o fator dos defeitos do sólido na força
// da borda (`field_film_defect`). As mesmas contas do WGSL, em f64.

import { pcgHash } from '../../math/reference/random';

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
 * de cada célula, 0 na seca; negativa na submersa, a água do volume): a espessura e o gradiente dela (por célula). A
 * submersa fica fora da leitura, com os pesos das outras renormalizados — junto à água do volume a película termina
 * nela, sem descer a zero ali; o ponto numa célula submersa não tem película.
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
    if (h(cu, cv) < 0) return { value: 0, slope: [0, 0] };
    const wu = filmWeights(gu - cu);
    const wv = filmWeights(gv - cv);
    const du = filmWeightSlopes(gu - cu);
    const dv = filmWeightSlopes(gv - cv);
    let weight = 0;
    let value = 0;
    let wdu = 0;
    let wdv = 0;
    let su = 0;
    let sv = 0;
    for (let b = 0; b < 3; b++)
        for (let a = 0; a < 3; a++) {
            const x = h(cu + a - 1, cv + b - 1);
            if (x < 0) continue;
            const w = wu[a]! * wv[b]!;
            weight += w;
            value += w * x;
            wdu += du[a]! * wv[b]!;
            wdv += wu[a]! * dv[b]!;
            su += du[a]! * wv[b]! * x;
            sv += wu[a]! * dv[b]! * x;
        }
    if (!(weight > 0)) return { value: 0, slope: [0, 0] };
    const mean = value / weight;
    return { value: mean, slope: [(su - wdu * mean) / weight, (sv - wdv * mean) / weight] };
}

/**
 * A inclinação da película (m/m) limitada pelo ângulo de contato de cosseno `cosTheta`: a superfície da água parada não
 * encontra o sólido mais inclinada que θ (Young); θ ≥ 90°, sem limite.
 */
export function filmSlopeCap(slope: readonly [number, number], cosTheta: number): [number, number] {
    const steep = Math.hypot(slope[0], slope[1]);
    const sin = Math.sqrt(Math.max(1 - cosTheta * cosTheta, 0));
    if (!(cosTheta > 1e-3) || steep * cosTheta <= sin) return [slope[0], slope[1]];
    const k = sin / (cosTheta * steep);
    return [slope[0] * k, slope[1] * k];
}

/**
 * O limiar da coalescência (τ = x + y u, u o número sorteado do quadrado), o alongamento (β = 1 + x χ, o ápice a y χ
 * do semieixo abaixo do centro), a amplitude do serpentear do filete (em células) e o raio da cabeça do filete (em
 * meias larguras).
 */
export const FILM_DROP_SITES = 4;
/** Os volumes dos sítios log-uniformes em 4 décadas: o peso e^(−L u) (`FIELD_FILM_DROP_SPREAD`). */
export const FILM_DROP_SPREAD = 9.21;
export const FILM_DROP_STRETCH: readonly [number, number] = [0.5, 0.25];
export const FILM_RIVULET_WANDER = 0.6;
export const FILM_RIVULET_HEAD = 1.4;

/** O volume (m³) da calota esférica de base `a` (m) e ângulo de contato θ: π a³ (2 − 3 cos θ + cos³ θ) / (3 sen³ θ). */
export function capVolume(a: number, theta: number): number {
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    return (Math.PI * a ** 3 * (2 - 3 * c + c ** 3)) / (3 * sn ** 3);
}

/** A base (m) da calota de volume `volume` (m³) e ângulo θ (a inversa de `capVolume`). */
export function capBase(volume: number, theta: number): number {
    const c = Math.cos(theta);
    const sn = Math.sin(theta);
    return Math.cbrt((3 * volume * sn ** 3) / (Math.PI * (2 - 3 * c + c ** 3)));
}

/** A forma da gota (`field_film_drop_shape`): a base redonda de mesma área, os semieixos de lado e ao longo, a carga. */
export interface DropShape {
    readonly a: number;
    readonly side: number;
    readonly along: number;
    /** A carga da borda χ: o peso ao longo do sólido sobre a força de Furmidge da largura (≥ 1: desliza). */
    readonly chi: number;
}

/**
 * A gota de volume `volume` e ângulo θ com a borda que segura `hold` (f / ρ, m³/s²) e a gravidade `gt` (m/s²) ao longo
 * do sólido: a calota de base a; com a carga χ₀ = g_t V / (f/ρ · 2a), a razão dos eixos β = 1 + x min(χ₀, 1), os
 * semieixos a⊥ = a / √β e a∥ = a √β (a área π a⊥ a∥ = π a²) e a carga pela largura de verdade, χ = g_t V / (f/ρ · 2a⊥).
 */
export function dropShape(volume: number, theta: number, hold: number, gt: number): DropShape {
    const a = capBase(volume, theta);
    if (!(gt > 1e-3)) return { a, side: a, along: a, chi: 0 };
    if (!(hold > 0)) return { a, side: a, along: a, chi: 2 };
    const load = (gt * volume) / (hold * 2 * a);
    const beta = 1 + FILM_DROP_STRETCH[0] * Math.min(load, 1);
    const side = a / Math.sqrt(beta);
    return { a, side, along: a * Math.sqrt(beta), chi: (gt * volume) / (hold * 2 * side) };
}

/**
 * A altura, a inclinação (no plano) e a curvatura da gota de forma `shape` no ponto a `r` do centro da base, com a
 * descida unitária `down` (`field_film_drop_at`): a calota de base a no espaço em que a base é redonda — o lado escalado
 * por a / a⊥, a descida por a / (a∥ ∓ δ) abaixo e acima do ápice deslocado δ = y min(χ, 1) a∥ para baixo; a curvatura,
 * a do eixo mais apertado.
 */
export function dropAt(
    r: readonly [number, number],
    shape: DropShape,
    down: readonly [number, number],
    theta: number,
    footprint: number,
): [number, number, number, number] {
    const delta = FILM_DROP_STRETCH[1] * Math.min(shape.chi, 1) * shape.along;
    const lateral = [-down[1], down[0]] as const;
    const t = r[0] * down[0] + r[1] * down[1] - delta;
    const l = r[0] * lateral[0] + r[1] * lateral[1];
    const st = shape.a / (t > 0 ? shape.along - delta : shape.along + delta);
    const sl = shape.a / shape.side;
    const cap = capAt([l * sl, t * st], shape.a, theta, footprint, 2);
    return [
        cap[0],
        cap[2] * st * down[0] + cap[1] * sl * lateral[0],
        cap[2] * st * down[1] + cap[1] * sl * lateral[1],
        cap[3] * Math.max(st * st, sl * sl),
    ];
}

/** Uma gota da célula: o centro da base (m, no plano) e o volume (m³). */
export interface FilmDrop {
    readonly center: readonly [number, number];
    readonly volume: number;
}

/** A meia extensão (m) da base da gota de forma `shape` em cada eixo do plano: a elipse com a cauda (δ para cima). */
export function dropExtent(shape: DropShape): number {
    const delta = FILM_DROP_STRETCH[1] * Math.min(shape.chi, 1) * shape.along;
    return Math.max(shape.along + delta, shape.side);
}

/**
 * As gotas em que se rompe a água parada `volume` (m³) da célula `cell` de lado `size` (`field_film_cell_drops`):
 * `FILM_DROP_SITES` sítios em posições sorteadas na célula inteira (`rand(k)` em [0, 1): o volume pelo peso e^(−L u) —
 * log-uniforme, a gota principal e as satélites —, a posição por dois sorteios), sem grade; duas gotas cujas bases se tocam
 * coalescem numa só, com o volume somado e o centro no centro de massa, se ela ainda couber (`fits`). Devolve `undefined`
 * se a maior não cabe: a água da célula é uma poça, a leitura contínua. A água da célula vai inteira às gotas.
 */
export function cellDrops(
    volume: number,
    cell: readonly [number, number],
    size: number,
    theta: number,
    rand: (k: number) => number,
    fits: (volume: number) => boolean,
): FilmDrop[] | undefined {
    if (!(volume > 0)) return [];
    const weights: number[] = [];
    for (let k = 0; k < FILM_DROP_SITES; k++)
        weights.push(Math.exp(-FILM_DROP_SPREAD * rand(3 * k)));
    const total = weights.reduce((x, y) => x + y, 0);
    const v = weights.map((w) => (volume * w) / total);
    if (!fits(Math.max(...v))) return undefined;
    const c: [number, number][] = [];
    for (let k = 0; k < FILM_DROP_SITES; k++)
        c.push([(cell[0] + rand(3 * k + 1)) * size, (cell[1] + rand(3 * k + 2)) * size]);
    // A coalescência em cadeia: passadas por todos os pares até nenhuma juntar (no máximo uma por gota a menos).
    for (let pass = 0; pass < FILM_DROP_SITES; pass++) {
        let joined = false;
        for (let i = 0; i < FILM_DROP_SITES; i++)
            for (let j = i + 1; j < FILM_DROP_SITES; j++) {
                if (!(v[i]! > 0 && v[j]! > 0)) continue;
                const ci = c[i]!;
                const cj = c[j]!;
                const touch = capBase(v[i]!, theta) + capBase(v[j]!, theta);
                if (Math.hypot(ci[0] - cj[0], ci[1] - cj[1]) >= touch) continue;
                const merged = v[i]! + v[j]!;
                if (!fits(merged)) continue;
                c[i] = [
                    (v[i]! * ci[0] + v[j]! * cj[0]) / merged,
                    (v[i]! * ci[1] + v[j]! * cj[1]) / merged,
                ];
                v[i] = merged;
                v[j] = 0;
                joined = true;
            }
        if (!joined) break;
    }
    const out: FilmDrop[] = [];
    for (let k = 0; k < FILM_DROP_SITES; k++)
        if (v[k]! > 0) out.push({ center: c[k]!, volume: v[k]! });
    return out;
}

/**
 * O logaritmo da razão das escalas da cunha junto à linha de contato (Cox–Voinov: o tamanho da gota sobre o
 * comprimento molecular, ln(10⁻³ / 10⁻⁷) ≈ 9; Le Grand, Daerr & Limat 2005 medem 10 a 20 ao ajustar ao modelo).
 */
export const FILM_CONTACT_LOG = 10;

/**
 * A velocidade (m/s) com que a água acima da espessura presa desce (`field_film_flow`): a da película fina de Nusselt,
 * r g_t h² / (3ν) (`r` o freio da rugosidade), limitada pela dissipação na linha de contato da frente (Kim, Lee & Kang
 * 2002; Le Grand, Daerr & Limat 2005): por largura, o peso que passa da borda, ρ g_t ℓ (h − h_presa), equilibra a força
 * viscosa da cunha 3 μ U ln Λ / θ — U = θ g_t ℓ (h − h_presa) / (3 ν ln Λ). A gota pouco acima do limiar desce a
 * poucos cm/s, não na queda da película livre.
 */
export function filmFlowSpeed(
    h: number,
    excess: number,
    gt: number,
    voxel: number,
    theta: number,
    nu: number,
    rough: number,
): number {
    const film = (rough * gt * h * h) / (3 * nu);
    const line = (theta * gt * voxel * Math.max(excess, 0)) / (3 * nu * FILM_CONTACT_LOG);
    return Math.min(film, line);
}

/**
 * A largura w (m) do filete de seção em arco de círculo de ângulo θ que leva a água `h` (m) de uma célula de lado
 * `cell` ao longo dela: a seção (w/2)² (θ − sen θ cos θ) / sen² θ é h ℓ.
 */
export function rivuletWidth(h: number, cell: number, theta: number): number {
    const sn = Math.sin(theta);
    return 2 * sn * Math.sqrt((h * cell) / (theta - sn * Math.cos(theta)));
}

/** A área da seção (m²) do filete de largura `w` e ângulo θ (o segmento de círculo). */
export function rivuletSection(w: number, theta: number): number {
    const sn = Math.sin(theta);
    return ((w / 2) ** 2 * (theta - sn * Math.cos(theta))) / sn ** 2;
}

/**
 * A altura, a inclinação no plano e a curvatura (1/R) da calota de base `a` e ângulo θ no ponto a `r` do centro, com a
 * média na amostra de largura `footprint` (a calota menor que ela esticada até o raio dela, a altura pela fração coberta
 * elevada a `dims`; a maior, com a borda na rampa linear da fração da amostra que cai nela — a inclinação média de quem
 * passa pela borda).
 */
export function capAt(
    r: readonly [number, number],
    a: number,
    theta: number,
    footprint: number,
    dims: number,
): [number, number, number, number] {
    const radius = a / Math.max(Math.sin(theta), 1e-3);
    const sample = Math.max(a, 0.5 * footprint);
    const k = a / sample;
    const cover = k ** dims;
    const rs: [number, number] = [r[0] * k, r[1] * k];
    const half = sample <= a ? 0.5 * footprint : 0;
    const rl = Math.hypot(rs[0], rs[1]);
    const edge =
        half > 0 ? Math.min(Math.max(0.5 + (0.5 * (a - rl)) / half, 0), 1) : rl < a ? 1 : 0;
    if (edge <= 0) return [0, 0, 0, 0];
    const c = Math.min(1, a / Math.max(rl, 1e-12));
    const rc: [number, number] = [rs[0] * c, rs[1] * c];
    const root = Math.sqrt(Math.max(radius * radius - rc[0] ** 2 - rc[1] ** 2, 1e-12));
    return [
        Math.max(root - radius * Math.cos(theta), 0) * cover * edge,
        (-rc[0] / root) * k * cover * edge,
        (-rc[1] / root) * k * cover * edge,
        (k * k * cover * edge) / radius,
    ];
}

/**
 * O ângulo do cone do pixel depois de uma gota de curvatura κ (1/m) em que ele tem a largura w (m), com o ângulo
 * `spread` antes (`refraction_chain_lens`): a lente fina plano-convexa de distância focal R / (n − 1) abre o ângulo
 * entre os raios do cone por w (n − 1) κ.
 */
export function lensSpread(spread: number, width: number, curvature: number, ior: number): number {
    return spread + width * (ior - 1) * curvature;
}

/**
 * A película de espessura `h` se rompe em gotas? Na molhagem parcial (κ > 0), abaixo da espessura crítica `critical`
 * (`filmBreakThickness`).
 */
export function filmBreaks(h: number, kappa: number, critical: number): boolean {
    return kappa > 0 && h > 0 && h < critical;
}

/**
 * O peso da vizinha `k` (0–3 as dos eixos, 4–7 as diagonais) no laplaciano isotrópico de nove pontos: 2/3 e 1/6.
 */
export function filmNeighborWeight(k: number): number {
    return k < 4 ? 2 / 3 : 1 / 6;
}

/**
 * Pressão da película sobre a densidade (m²/s²): o peso da coluna na face voltada para cima e a de Laplace pelas oito
 * vizinhas do plano (as quatro dos eixos e as quatro diagonais, pelos pesos do laplaciano isotrópico; a seca conta como
 * a própria célula: sem fluxo pela linha de contato).
 */
export function filmPressure(
    h: number,
    around: readonly (number | undefined)[],
    gn: number,
    tensionPerDensity: number,
    cell: number,
): number {
    const laplacian = around.reduce<number>(
        (a, x, k) => a + filmNeighborWeight(k) * ((x ?? h) - h),
        0,
    );
    return Math.max(gn, 0) * h - (tensionPerDensity * laplacian) / (cell * cell);
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

/**
 * A fração da célula de lado `cell` coberta pelo disco de raio `radius` cujo centro está a `distance` do centro dela (a
 * borda do disco como a reta que corta a célula: a fração linear na distância com sinal, de 0 a 1 numa célula). A
 * deposição pesa a residual por ela: a leitura suave das células dá a borda do disco redonda, não a do conjunto de
 * células inteiras que ele toca (o quadrado de cantos arredondados).
 */
export function filmCoverage(distance: number, radius: number, cell: number): number {
    return Math.min(Math.max(0.5 + (radius - distance) / cell, 0), 1);
}

/**
 * A espessura da poça em que a gota passada à película se abre (m): a altura que a linha de contato segura contra o peso
 * normal à superfície, √(2 f / (ρ g_n)) (`f / ρ` = `holdPerDensity`), até a película mais grossa do modelo (`max`) — na
 * parede (sem peso normal) ela.
 */
export function puddleThickness(holdPerDensity: number, gn: number, max: number): number {
    return gn > 1e-3 ? Math.min(max, Math.sqrt((2 * holdPerDensity) / gn)) : max;
}

/**
 * A gota que desliza passada à película (T066d): o volume dela (`units` unidades inteiras da pendente: as do pingo, a
 * conta inversa) repartido nas células do disco da poça pela cobertura de cada uma (`weights`, as fora do sólido com
 * peso 0) — a parte inteira de cada uma, e o que sobra do arredondamento na célula do contato (`center`). Nada se perde
 * nem se cria: a soma devolvida é `units`.
 */
export function absorbUnits(units: number, weights: readonly number[], center: number): number[] {
    const total = weights.reduce((a, w) => a + w, 0);
    let left = units;
    const out = weights.map((w) => {
        if (!(total > 0) || !(w > 0)) return 0;
        const k = Math.min(Math.floor((units * w) / total), left);
        left -= k;
        return k;
    });
    out[center] = (out[center] ?? 0) + left;
    return out;
}

/**
 * O fator dos defeitos do sólido na força da borda da célula `c` com a desigualdade `spread` (`field_film_defect`,
 * `SurfacePhysics.pinningSpread`): log-normal de mediana 1 pelo hash dela (a soma das duas metades de 16 bits, quase
 * gaussiana, escalada a desvio 1), a mesma aritmética u32 do WGSL.
 */
export function filmDefect(c: readonly [number, number, number], spread: number): number {
    if (!(spread > 0)) return 1;
    const h = pcgHash(
        (c[0] | 0)
            ^ 0x27d4eb2f
            ^ pcgHash((c[1] | 0) ^ 0x165667b1 ^ pcgHash((c[2] | 0) ^ 0xd3a2646c)),
    );
    const n = ((h & 0xffff) + (h >>> 16)) / 65535 - 1;
    return Math.exp(spread * 2.449 * n);
}

/**
 * O raio crítico (m) da base da gota redonda de ângulo θ que a borda `hold` (f / ρ, m³/s²) segura contra a gravidade
 * `gt` (m/s²) ao longo do sólido (Furmidge 1962; ElSherbini & Jacobi 2006 com k = 1 e a largura 2a): ρ g_t V(a) = f 2a,
 * V = c a³ — a_c = √(2 (f/ρ) / (g_t c)). Abaixo dele a gota fica; acima, escorre.
 */
export function criticalDropBase(hold: number, gt: number, theta: number): number {
    const c = capVolume(1, theta);
    return Math.sqrt((2 * hold) / (gt * c));
}

/**
 * O ângulo de recuo θr (rad) da água de ângulo de equilíbrio θ num sólido em que a borda segura f/ρ = `hold` (m³/s²),
 * com γ/ρ = `gammaRho` (`field_film_receding_cos`): cos θr − cos θa = f/γ e, com os dois a ±δ de θ, isso é 2 sen θ sen δ —
 * θr = θ − δ. A borda de trás da água que corre: a seção do filete.
 */
export function recedingAngle(theta: number, hold: number, gammaRho: number): number {
    const s = Math.sin(theta);
    if (!(s > 1e-4)) return theta;
    const delta = Math.asin(Math.min(Math.max(hold / gammaRho / (2 * s), 0), 1));
    return Math.max(theta - delta, 0);
}

/** Uma direção possível da descida (`descentChoice`): o cosseno do desvio dela da gravidade e a espessura presa ali (m). */
export interface DescentCandidate {
    readonly along: number;
    readonly pinned: number;
}

/** O desvio de lado mais forte da descida (`FIELD_FILM_DESCENT_LATERAL`): meia célula de lado por célula descida. */
export const FILM_DESCENT_LATERAL = 0.5;

/**
 * A chance de o passo ir de lado (`field_film_descent`): a vantagem da força do lado sobre a da reta, sobre a espessura
 * `h`, até `FILM_DESCENT_LATERAL` — a média do desvio por célula descida; 0 quando a reta ganha.
 */
export function descentLateral(h: number, straight: number, side: number): number {
    if (!(side > straight)) return 0;
    return Math.min((side - straight) / Math.max(h, 1e-12), FILM_DESCENT_LATERAL);
}

/**
 * A direção que a água de espessura `h` (m) que rompe a borda toma entre as candidatas (`field_film_descent`): a de
 * maior h · cos(desvio) − h_presa (a força ao longo dela contra a borda presa ali); as de cos ≤ 0 não contam. No empate,
 * a primeira. Devolve o índice, ou −1 sem nenhuma.
 */
export function descentChoice(h: number, candidates: readonly DescentCandidate[]): number {
    let best = -1;
    let score = -Infinity;
    candidates.forEach((c, i) => {
        if (!(c.along > 0)) return;
        const s = h * c.along - c.pinned;
        if (s > score) {
            score = s;
            best = i;
        }
    });
    return best;
}
