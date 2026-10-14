// Medidas do smoke de comportamento de fluido (spec 030), sobre as posições lidas de volta do pool: forma (semieixos
// pela covariância), componentes conexos e partículas isoladas (por raio de vizinhança), energia cinética, altura da
// superfície junto à parede e área de contato.

/** Posições e velocidades (xyz) de um pool lido de volta. */
export interface Particles {
    readonly count: number;
    readonly pos: Float32Array;
    readonly vel: Float32Array;
}

function centroid(p: Particles): [number, number, number] {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < p.count; i++) {
        x += p.pos[3 * i]!;
        y += p.pos[3 * i + 1]!;
        z += p.pos[3 * i + 2]!;
    }
    return [x / p.count, y / p.count, z / p.count];
}

/** Autovalores de uma matriz simétrica 3×3 (Jacobi). */
function symmetricEigenvalues(m: number[][]): [number, number, number] {
    const a = m.map((r) => [...r]);
    for (let sweep = 0; sweep < 50; sweep++) {
        let off = 0;
        for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) off += a[i]![j]! ** 2;
        if (off < 1e-20) break;
        for (let p = 0; p < 3; p++)
            for (let q = p + 1; q < 3; q++) {
                const apq = a[p]![q]!;
                if (Math.abs(apq) < 1e-30) continue;
                const theta = (a[q]![q]! - a[p]![p]!) / (2 * apq);
                const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
                const c = 1 / Math.sqrt(t * t + 1);
                const s = t * c;
                for (let k = 0; k < 3; k++) {
                    const akp = a[k]![p]!;
                    const akq = a[k]![q]!;
                    a[k]![p] = c * akp - s * akq;
                    a[k]![q] = s * akp + c * akq;
                }
                for (let k = 0; k < 3; k++) {
                    const apk = a[p]![k]!;
                    const aqk = a[q]![k]!;
                    a[p]![k] = c * apk - s * aqk;
                    a[q]![k] = s * apk + c * aqk;
                }
            }
    }
    return [a[0]![0]!, a[1]![1]!, a[2]![2]!];
}

/** Razão entre o maior e o menor semieixo (raiz dos autovalores da covariância das posições). */
export function axisRatio(p: Particles): number {
    const c = centroid(p);
    const m = [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
    ];
    for (let i = 0; i < p.count; i++) {
        const d = [0, 1, 2].map((k) => p.pos[3 * i + k]! - c[k]!);
        for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) m[a]![b]! += d[a]! * d[b]!;
    }
    const ev = symmetricEigenvalues(m).map((v) => Math.sqrt(Math.max(v, 0)));
    return Math.max(...ev) / Math.max(Math.min(...ev), 1e-12);
}

/** Vizinhos a menos de `radius` de cada partícula (grade uniforme). */
function neighbors(p: Particles, radius: number): number[][] {
    const cell = new Map<string, number[]>();
    const key = (x: number, y: number, z: number): string => `${x},${y},${z}`;
    const at = (i: number): [number, number, number] => [
        Math.floor(p.pos[3 * i]! / radius),
        Math.floor(p.pos[3 * i + 1]! / radius),
        Math.floor(p.pos[3 * i + 2]! / radius),
    ];
    for (let i = 0; i < p.count; i++) {
        const k = key(...at(i));
        const list = cell.get(k);
        if (list === undefined) cell.set(k, [i]);
        else list.push(i);
    }
    const r2 = radius * radius;
    const out: number[][] = [];
    for (let i = 0; i < p.count; i++) {
        const [cx, cy, cz] = at(i);
        const mine: number[] = [];
        for (let dx = -1; dx <= 1; dx++)
            for (let dy = -1; dy <= 1; dy++)
                for (let dz = -1; dz <= 1; dz++) {
                    for (const j of cell.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
                        if (j === i) continue;
                        const d2 =
                            (p.pos[3 * i]! - p.pos[3 * j]!) ** 2
                            + (p.pos[3 * i + 1]! - p.pos[3 * j + 1]!) ** 2
                            + (p.pos[3 * i + 2]! - p.pos[3 * j + 2]!) ** 2;
                        if (d2 < r2) mine.push(j);
                    }
                }
        out.push(mine);
    }
    return out;
}

/** Componentes conexos com pelo menos `minSize` partículas (ligação: distância < `radius`). */
export function components(p: Particles, radius: number, minSize = 4): number {
    const nb = neighbors(p, radius);
    const seen = new Uint8Array(p.count);
    let n = 0;
    for (let i = 0; i < p.count; i++) {
        if (seen[i] === 1) continue;
        let size = 0;
        const stack = [i];
        seen[i] = 1;
        while (stack.length > 0) {
            const k = stack.pop()!;
            size++;
            for (const j of nb[k]!) {
                if (seen[j] === 0) {
                    seen[j] = 1;
                    stack.push(j);
                }
            }
        }
        if (size >= minSize) n++;
    }
    return n;
}

/** Partículas sem nenhuma vizinha a menos de `radius`. */
export function isolated(p: Particles, radius: number): number {
    return sparse(p, radius, 1);
}

/** Partículas soltas: menos de `k` vizinhas a menos de `radius` (respingo, borda esgarçada). */
export function sparse(p: Particles, radius: number, k: number): number {
    return neighbors(p, radius).filter((l) => l.length < k).length;
}

/** Energia cinética por massa: ½ Σ |v|² / N. */
export function kinetic(p: Particles): number {
    let e = 0;
    for (let i = 0; i < 3 * p.count; i++) e += p.vel[i]! ** 2;
    return (0.5 * e) / p.count;
}

/** Algum valor não finito em posição ou velocidade. */
export function hasNaN(p: Particles): boolean {
    for (let i = 0; i < 3 * p.count; i++) {
        if (!Number.isFinite(p.pos[i]!) || !Number.isFinite(p.vel[i]!)) return true;
    }
    return false;
}

/**
 * Altura da superfície numa faixa de x: média, sobre colunas de largura `cell` em z, da maior altura das partículas com
 * x em [x0, x1].
 */
export function surfaceHeight(p: Particles, x0: number, x1: number, cell: number): number {
    const top = new Map<number, number>();
    for (let i = 0; i < p.count; i++) {
        const x = p.pos[3 * i]!;
        if (x < x0 || x > x1) continue;
        const k = Math.floor(p.pos[3 * i + 2]! / cell);
        top.set(k, Math.max(top.get(k) ?? -Infinity, p.pos[3 * i + 1]!));
    }
    const values = [...top.values()];
    return values.reduce((a, b) => a + b, 0) / Math.max(values.length, 1);
}

/** Área de contato com o chão: células (x, z) de lado `cell` com alguma partícula abaixo de `height`, vezes cell². */
export function contactArea(p: Particles, height: number, cell: number): number {
    const cells = new Set<string>();
    for (let i = 0; i < p.count; i++) {
        if (p.pos[3 * i + 1]! > height) continue;
        cells.add(`${Math.floor(p.pos[3 * i]! / cell)},${Math.floor(p.pos[3 * i + 2]! / cell)}`);
    }
    return cells.size * cell * cell;
}

/** Centróide (x, y, z). */
export function center(p: Particles): [number, number, number] {
    return centroid(p);
}

/** Maior coordenada `axis` (frente da onda). */
export function front(p: Particles, axis: 0 | 1 | 2): number {
    let m = -Infinity;
    for (let i = 0; i < p.count; i++) m = Math.max(m, p.pos[3 * i + axis]!);
    return m;
}

/** Hash FNV-1a de bytes (identidade bit a bit nas fixtures). */
export function hashBytes(bytes: Uint8Array): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < bytes.length; i++) {
        h ^= bytes[i]!;
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
}
