// Referência de CPU do depósito e da leitura das cáusticas no hash dos fótons (spec 034, R6) — a mesma regra de
// `gi_photon_common.wgsl` (`gi_photon_frame`), `gi_photon_trace.wgsl` (`gi_photon_deposit`) e `gi_photon.wgsl`
// (`gi_caustic_irradiance`). Pelo eixo dominante da normal: bilinear nas 4 células em volta do ponto no plano da
// superfície, na camada do plano no centro de cada uma, × |n_dominante| no depósito; a leitura lê a camada vizinha a até
// ¼ de célula da fronteira. A irradiância de uma célula é a soma depositada / h².

type Vec3 = readonly [number, number, number];

interface Frame {
    readonly axis: number;
    readonly others: readonly [number, number];
    readonly plane: readonly [number, number];
    readonly height: number;
    readonly slopes: readonly [number, number];
    readonly slope: number;
}

function frame(p: Vec3, n: Vec3, h: number): Frame {
    const a = n.map(Math.abs);
    const axis = a[0]! >= a[1]! && a[0]! >= a[2]! ? 0 : a[1]! >= a[2]! ? 1 : 2;
    const others: [number, number] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
    const g = p.map((v) => v / h);
    const na = n[axis] >= 0 ? Math.max(n[axis], 1e-3) : Math.min(n[axis], -1e-3);
    return {
        axis,
        others,
        plane: [g[others[0]]! - 0.5, g[others[1]]! - 0.5],
        height: g[axis]!,
        slopes: [-n[others[0]]! / na, -n[others[1]]! / na],
        slope: Math.abs(na),
    };
}

const heightAt = (f: Frame, i: number, j: number): number =>
    f.height + f.slopes[0] * (i - f.plane[0]) + f.slopes[1] * (j - f.plane[1]);

function key(f: Frame, i: number, j: number, layer: number): string {
    const c = [0, 0, 0];
    c[f.axis] = layer;
    c[f.others[0]] = i;
    c[f.others[1]] = j;
    return c.join(',');
}

/** O hash das cáusticas: as somas por célula (sem a média móvel; a de um quadro). */
export class PhotonHash {
    private readonly cells = new Map<string, number>();

    /** @param cell Lado da célula (m). */
    constructor(private readonly cell: number) {}

    /** Deposita a potência `power` (W) de um fóton no ponto `p` da superfície de normal `n`. */
    deposit(p: Vec3, n: Vec3, power: number): void {
        const f = frame(p, n, this.cell);
        const [bi, bj] = [Math.floor(f.plane[0]), Math.floor(f.plane[1])];
        const [ti, tj] = [f.plane[0] - bi, f.plane[1] - bj];
        for (let k = 0; k < 4; k++) {
            const [oi, oj] = [k & 1, k >> 1];
            const w = (oi === 1 ? ti : 1 - ti) * (oj === 1 ? tj : 1 - tj);
            const layer = Math.floor(heightAt(f, bi + oi, bj + oj));
            const id = key(f, bi + oi, bj + oj, layer);
            this.cells.set(id, (this.cells.get(id) ?? 0) + power * w * f.slope);
        }
    }

    /** Irradiância (W/m²) no ponto `p` da superfície de normal `n`. */
    irradiance(p: Vec3, n: Vec3): number {
        const f = frame(p, n, this.cell);
        const [bi, bj] = [Math.floor(f.plane[0]), Math.floor(f.plane[1])];
        const [ti, tj] = [f.plane[0] - bi, f.plane[1] - bj];
        const area = this.cell * this.cell;
        let e = 0;
        for (let k = 0; k < 4; k++) {
            const [oi, oj] = [k & 1, k >> 1];
            const w = (oi === 1 ? ti : 1 - ti) * (oj === 1 ? tj : 1 - tj);
            const height = heightAt(f, bi + oi, bj + oj);
            const layer = Math.floor(height);
            const depth = height - layer;
            let sum = this.cells.get(key(f, bi + oi, bj + oj, layer)) ?? 0;
            if (depth < 0.25) sum += this.cells.get(key(f, bi + oi, bj + oj, layer - 1)) ?? 0;
            if (depth > 0.75) sum += this.cells.get(key(f, bi + oi, bj + oj, layer + 1)) ?? 0;
            e += (sum / area) * w;
        }
        return e;
    }
}
