import { describe, expect, it } from 'vitest';
import { ParticlePhysics } from '../../ParticlePhysics';
import {
    CSF_NORMAL_MIN,
    csfCurvatures,
    csfNormals,
    halfSpace,
    kernelGradient,
    kernelSupport,
    wallSupport,
    youngNormal,
    type CsfKernel,
    type Vec3,
} from '../surfaceTension';

const S = 0.025;
const H: Record<CsfKernel, number> = { cubic: 1.3 * S, poly6: 2 * S };

/** Esfera de partículas de raio `r` espaçamentos, em rede com 5 % de desordem (semente fixa). */
function sphere(r: number): Vec3[] {
    let seed = 7;
    const jitter = (): number =>
        ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.05 * S;
    const out: Vec3[] = [];
    const n = r + 1;
    for (let x = -n; x <= n; x++)
        for (let y = -n; y <= n; y++)
            for (let z = -n; z <= n; z++) {
                const p: Vec3 = [x * S + jitter(), y * S + jitter(), z * S + jitter()];
                if (Math.hypot(...p) <= r * S) out.push(p);
            }
    return out;
}

describe('tensão superficial contínua (referência f64, spec 034 T066e)', () => {
    it.each(['cubic', 'poly6'] as const)(
        'curvatura média da borda de uma esfera ≈ 2/R (%s)',
        (kernel) => {
            const R = 6 * S;
            const scene = { positions: sphere(6), kernel, h: H[kernel], volume: S ** 3 };
            const kappa = csfCurvatures(scene)
                .map((c) => c.kappa)
                .filter((k) => !Number.isNaN(k));
            const mean = kappa.reduce((a, b) => a + b, 0) / kappa.length;
            expect(kappa.length).toBeGreaterThan(400);
            expect((mean * R) / 2).toBeGreaterThan(0.95);
            expect((mean * R) / 2).toBeLessThan(1.05);
        },
    );

    it('a força da esfera aponta para dentro', () => {
        const positions = sphere(6);
        const curv = csfCurvatures({ positions, kernel: 'cubic', h: H.cubic, volume: S ** 3 });
        let inward = 0;
        let outward = 0;
        positions.forEach((p, i) => {
            const a = curv[i]!.accel;
            const radial = a[0] * p[0] + a[1] * p[1] + a[2] * p[2];
            if (radial < 0) inward++;
            else if (radial > 0) outward++;
        });
        expect(inward).toBeGreaterThan(10 * outward);
    });

    it('normal de Young: 0° entra no sólido, 180° sai, 90° ao longo dele', () => {
        const w: Vec3 = [0, 1, 0];
        const n: Vec3 = [Math.SQRT1_2, -Math.SQRT1_2, 0];
        const close = (a: Vec3, b: Vec3): void => {
            a.forEach((v, k) => {
                expect(v).toBeCloseTo(b[k]!, 12);
            });
        };
        close(youngNormal(n, w, 1), [0, -1, 0]);
        close(youngNormal(n, w, -1), [0, 1, 0]);
        close(youngNormal(n, w, 0), [1, 0, 0]);
        close(youngNormal(n, w, Math.cos(Math.PI / 3)), [Math.sin(Math.PI / 3), -0.5, 0]);
    });

    it.each(['cubic', 'poly6'] as const)(
        'meio-espaço do núcleo na face do sólido (%s)',
        (kernel) => {
            const h = H[kernel];
            // Metade do volume do núcleo e metade do suporte da divergência (Σ V |∇W| r = 3 no espaço todo).
            expect(halfSpace(kernel, 0, h)[0]).toBeCloseTo(0.5, 3);
            expect(halfSpace(kernel, 0.3 * h, h)[1]).toBeLessThan(0);
            expect(wallSupport(kernel, 0, h)).toBeCloseTo(1.5, 3);
            expect(wallSupport(kernel, kernelSupport(kernel, h), h)).toBe(0);
        },
    );

    it.each([
        ['SPH', 'cubic', 1.3, 2.6],
        ['PBF', 'poly6', 2, 2],
    ] as const)(
        'a fração da interface amostrada no %s é a da rede (Σ s |∇c| das camadas com normal)',
        (solver, kernel, h, support) => {
            // Semiespaço y ≤ 0 em rede de espaçamento 1: |∇c| de cada camada.
            const reach = Math.ceil(support);
            let total = 0;
            for (let layer = 0; layer <= reach; layer++) {
                let g = 0;
                for (let x = -reach; x <= reach; x++)
                    for (let y = -layer - reach; y <= 0; y++)
                        for (let z = -reach; z <= reach; z++)
                            g += kernelGradient(kernel, [-x, -layer - y, -z], h)[1];
                if (Math.abs(g) >= CSF_NORMAL_MIN / h) total += Math.abs(g);
            }
            const physics = new ParticlePhysics({ particleSpacing: S, cohesion: 3 });
            const ratio =
                physics.surfaceTensionOverDensity() / physics.surfaceTensionKernel(solver);
            expect(ratio).toBeCloseTo(total, 10);
        },
    );

    it('a normal de uma lâmina sobre o sólido some no miolo (o sólido contado como fluido)', () => {
        const positions: Vec3[] = [];
        for (let x = -6; x <= 6; x++)
            for (let z = -6; z <= 6; z++)
                for (let y = 0; y < 5; y++) positions.push([x * S, (y + 0.5) * S, z * S]);
        const normals = csfNormals({
            positions,
            kernel: 'cubic',
            h: H.cubic,
            volume: S ** 3,
            planes: [{ normal: [0, 1, 0], offset: 0 }],
        });
        const at = (y: number): number =>
            positions.findIndex(
                (p) => p[0] === 0 && p[2] === 0 && Math.abs(p[1] - (y + 0.5) * S) < 1e-12,
            );
        expect(normals[at(0)]!.magnitude).toBe(0);
        expect(normals[at(4)]!.normal[1]).toBeCloseTo(-1, 6);
    });

    it('ângulo de contato de Young–Dupré no modo adimensional e o da física', () => {
        const cos = (adhesion: number): number =>
            new ParticlePhysics({ particleSpacing: S, cohesion: 3, adhesion }).contactCosine;
        expect(cos(0)).toBe(-1);
        expect(cos(3)).toBe(0);
        expect(cos(4)).toBeCloseTo(1 / 3, 12);
        expect(cos(8)).toBe(1);
        expect(new ParticlePhysics({ particleSpacing: S }).contactCosine).toBe(0);
        const water = new ParticlePhysics({ ...ParticlePhysics.WATER, particleSpacing: S });
        expect(water.contactCosine).toBeCloseTo(Math.cos(Math.PI / 6), 10);
    });
});
