// Referência em f64 da gota sobre a lâmina de vidro vista de lado (spec 034, T066d; só para testes e smokes): para onde
// vai a energia de um raio da câmera que entra por uma calota de água (ângulo de contato θ, raio da base a) sobre uma
// lâmina de vidro de espessura T, com ar dos dois lados. A geometria e o Fresnel são exatos (luz não polarizada), os
// dois lobos de cada interface seguidos sem sorteio (a árvore inteira, até a profundidade `depth` em interfaces). A
// energia termina de três modos: escapa para o ambiente (`escaped`), chega ao teto de interfaces ainda viva (`capped`:
// a reflexão interna total a prende na lâmina, que a leva para longe da gota) ou cai abaixo do peso mínimo
// (`pruned`). Sem absorção, as três somam 1: o que o traçado mostra preto no teto é `capped`, não energia perdida.

/** Vetor 3D (x, y, z); a lâmina ocupa −T ≤ z ≤ 0, a gota fica em z ≥ 0 e a câmera do lado +z. */
export type V3 = readonly [number, number, number];

/** A gota e a lâmina: ângulo de contato (rad), raio da base (m), espessura (m) e os índices. */
export interface WetPane {
    readonly contact: number;
    readonly base: number;
    readonly thickness: number;
    readonly water: number;
    readonly glass: number;
}

/** O destino da energia de um raio (frações do peso inicial). */
export interface WetFate {
    escaped: number;
    capped: number;
    pruned: number;
}

const AIR = 1;

function dot(a: V3, b: V3): number {
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function add(a: V3, b: V3, s: number): V3 {
    return [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];
}

function norm(a: V3): V3 {
    const l = Math.hypot(a[0], a[1], a[2]);
    return [a[0] / l, a[1] / l, a[2] / l];
}

/** Fresnel exato (não polarizado) de `n1` para `n2` com o cosseno de incidência `cosI` (1 na reflexão total). */
export function fresnel(cosI: number, n1: number, n2: number): number {
    const c = Math.min(Math.abs(cosI), 1);
    const sinT = (n1 / n2) * Math.sqrt(1 - c * c);
    if (sinT >= 1) return 1;
    const cosT = Math.sqrt(1 - sinT * sinT);
    const rs = (n1 * c - n2 * cosT) / (n1 * c + n2 * cosT);
    const rp = (n2 * c - n1 * cosT) / (n2 * c + n1 * cosT);
    return 0.5 * (rs * rs + rp * rp);
}

/** `d` refletida pela normal `n` (qualquer lado). */
function reflect(d: V3, n: V3): V3 {
    return add(d, n, -2 * dot(d, n));
}

/** `d` refratada de `n1` para `n2` pela normal `n` (qualquer lado); nula na reflexão total. */
function refract(d: V3, n: V3, n1: number, n2: number): V3 | null {
    const m: V3 = dot(d, n) < 0 ? n : [-n[0], -n[1], -n[2]];
    const eta = n1 / n2;
    const c = -dot(d, m);
    const k = 1 - eta * eta * (1 - c * c);
    if (k < 0) return null;
    return norm(add([d[0] * eta, d[1] * eta, d[2] * eta], m, eta * c - Math.sqrt(k)));
}

const EPS = 1e-12;

/** O próximo acerto do raio (o, d) no meio de índice `n`: a distância, a normal e o índice do outro lado. */
function nextHit(
    pane: WetPane,
    o: V3,
    d: V3,
    n: number,
): { t: number; normal: V3; other: number } | null {
    const R = pane.base / Math.sin(pane.contact);
    const center: V3 = [0, 0, -R * Math.cos(pane.contact)];
    let best: { t: number; normal: V3; other: number } | null = null;
    const take = (t: number, normal: V3, other: number): void => {
        if (t > EPS && (best === null || t < best.t)) best = { t, normal, other };
    };
    // A calota (só a parte em z ≥ 0): ar ↔ água.
    if (n === AIR || n === pane.water) {
        const oc: V3 = [o[0] - center[0], o[1] - center[1], o[2] - center[2]];
        const b = dot(oc, d);
        const disc = b * b - (dot(oc, oc) - R * R);
        if (disc >= 0) {
            for (const t of [-b - Math.sqrt(disc), -b + Math.sqrt(disc)]) {
                const p = add(o, d, t);
                if (t > EPS && p[2] >= 0) {
                    take(
                        t,
                        norm([p[0] - center[0], p[1] - center[1], p[2] - center[2]]),
                        n === AIR ? pane.water : AIR,
                    );
                }
            }
        }
    }
    // A face da frente (z = 0): sob a base, água ↔ vidro; fora dela, ar ↔ vidro.
    if (Math.abs(d[2]) > 0) {
        const t = -o[2] / d[2];
        const p = add(o, d, t);
        const under = Math.hypot(p[0], p[1]) < pane.base;
        const front: V3 = [0, 0, 1];
        if (n === pane.glass) take(t, front, under ? pane.water : AIR);
        else if (n === pane.water && under) take(t, front, pane.glass);
        else if (n === AIR && !under) take(t, front, pane.glass);
        // A face de trás (z = −T): vidro ↔ ar.
        const tb = (-pane.thickness - o[2]) / d[2];
        if (n === pane.glass || n === AIR) take(tb, [0, 0, -1], n === AIR ? pane.glass : AIR);
    }
    return best;
}

/**
 * O destino da energia do raio da câmera (o, d) no ar: a árvore dos dois lobos de cada interface até `depth`
 * interfaces, os ramos de peso abaixo de `minWeight` cortados.
 */
export function wetFate(pane: WetPane, o: V3, d: V3, depth: number, minWeight = 1e-7): WetFate {
    const fate: WetFate = { escaped: 0, capped: 0, pruned: 0 };
    const stack: { o: V3; d: V3; n: number; w: number; k: number }[] = [
        { o, d, n: AIR, w: 1, k: 0 },
    ];
    while (stack.length > 0) {
        const s = stack.pop()!;
        if (s.w < minWeight) {
            fate.pruned += s.w;
            continue;
        }
        const hit = nextHit(pane, s.o, s.d, s.n);
        if (hit === null) {
            fate.escaped += s.w;
            continue;
        }
        if (s.k >= depth) {
            fate.capped += s.w;
            continue;
        }
        const p = add(s.o, s.d, hit.t);
        const f = fresnel(dot(s.d, hit.normal), s.n, hit.other);
        const t = refract(s.d, hit.normal, s.n, hit.other);
        const r = reflect(s.d, hit.normal);
        const fr = t === null ? 1 : f;
        stack.push({ o: p, d: r, n: s.n, w: s.w * fr, k: s.k + 1 });
        if (t !== null) stack.push({ o: p, d: t, n: hit.other, w: s.w * (1 - fr), k: s.k + 1 });
    }
    return fate;
}

/**
 * Os raios da câmera de inclinação `view` (rad, em torno de y) sobre a gota: um por ponto de uma grade de `n` × `n`
 * na base dela (os que acertam a calota), o destino de cada. Com `through`, a câmera fica do outro lado da lâmina e vê
 * a gota através do vidro (a gota na face de trás). Saem o x do ponto na base (−1 a 1 em raios da base) e o destino.
 */
export function wetFateAcross(
    pane: WetPane,
    view: number,
    depth: number,
    n: number,
    through = false,
): { x: number; fate: WetFate }[] {
    const d: V3 = [Math.sin(view), 0, through ? Math.cos(view) : -Math.cos(view)];
    const out: { x: number; fate: WetFate }[] = [];
    for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
            const x = ((i + 0.5) / n) * 2 - 1;
            const y = ((j + 0.5) / n) * 2 - 1;
            if (x * x + y * y >= 1) continue;
            // O raio que passa pelo ponto da base (x a, y a, 0), vindo de longe.
            const target: V3 = [x * pane.base, y * pane.base, 0];
            const o = add(target, d, -1);
            out.push({ x, fate: wetFate(pane, o, d, depth) });
        }
    }
    return out;
}

/**
 * O raio de vidro de direção `d` (subindo, +z) que sai da lâmina pelo ponto (x, y, 0) da base da gota, seguido exato
 * dentro dela: a refração vidro → água na base e as voltas na calota até sair pela calota (`out`: a direção no ar) ou
 * descer de novo à base (`back`: a direção de volta no vidro). Sem os lobos de Fresnel: só o caminho da refração e,
 * na reflexão interna total, o da reflexão (o que a calota faz com o raio inteiro).
 */
export function wetExit(
    pane: WetPane,
    x: number,
    y: number,
    d: V3,
    maxBounces = 64,
): { kind: 'out' | 'back'; dir: V3; bounces: number } | null {
    const up: V3 = [0, 0, 1];
    let dir = refract(d, up, pane.glass, pane.water);
    if (dir === null) return null;
    let o: V3 = [x, y, 0];
    for (let k = 0; k < maxBounces; k++) {
        const hit = nextHit(pane, o, dir, pane.water);
        if (hit === null) return null;
        const p = add(o, dir, hit.t);
        if (hit.other === pane.glass) {
            const back = refract(dir, hit.normal, pane.water, pane.glass);
            return back === null ? null : { kind: 'back', dir: back, bounces: k };
        }
        const out = refract(dir, hit.normal, pane.water, AIR);
        if (out !== null) return { kind: 'out', dir: out, bounces: k };
        dir = reflect(dir, hit.normal);
        o = p;
    }
    return null;
}

/** A normal da calota acima do ponto (x, y) da base (a da superfície da água em z ≥ 0). */
export function capNormal(pane: WetPane, x: number, y: number): V3 {
    const R = pane.base / Math.sin(pane.contact);
    const zc = -R * Math.cos(pane.contact);
    const z = zc + Math.sqrt(Math.max(R * R - x * x - y * y, 0));
    return norm([x, y, z - zc]);
}
