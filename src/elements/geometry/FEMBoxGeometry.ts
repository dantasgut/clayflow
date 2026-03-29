import { Geometry }     from '../../scene/components/Geometry';
import { VertexLayout } from '../../scene/data/VertexLayout';

/**
 * Geometria de superfície para corpos FEM de caixa lattice.
 *
 * Mapeia exatamente os nós da malha FEM como vértices:
 *   índice do nó: idx(ix, iy, iz) = ix + iy*(cellsX+1) + iz*(cellsX+1)*(cellsY+1)
 *
 * O vertex buffer tem (cellsX+1)*(cellsY+1)*(cellsZ+1) entradas, stride 8 floats
 * [px, py, pz, nx, ny, nz, u, v]. O index buffer renderiza apenas a superfície.
 *
 * `fem_vertex_write` escreve apenas `pos.xyz` em `vertex_buffer[i*8 .. i*8+2]`,
 * preservando normais e UVs — por isso a geometria initial deve ter normais corretas.
 *
 * Normais calculadas por acumulação de faces: cada nó acumula o vetor normal
 * de cada face de superfície à qual pertence (bottom/top/front/back/left/right)
 * e normaliza o resultado. Vértices de canto acumulam até 3 normais.
 */
export class FEMBoxGeometry extends Geometry {
    constructor(
        width:   number,
        height:  number,
        depth:   number,
        cellsX:  number,
        cellsY:  number,
        cellsZ:  number,
        offsetX = 0,
        offsetY = 0,
        offsetZ = 0,
    ) {
        super();
        this.build(width, height, depth, cellsX, cellsY, cellsZ, offsetX, offsetY, offsetZ);
    }

    private build(
        W: number, H: number, D: number,
        NX: number, NY: number, NZ: number,
        ox: number, oy: number, oz: number,
    ): void {
        const nNodes = (NX + 1) * (NY + 1) * (NZ + 1);
        const dx = W / NX;
        const dy = H / NY;
        const dz = D / NZ;

        const vertices = new Float32Array(nNodes * 8);
        // Temporary normal accumulators (3 floats per node)
        const nrmAcc = new Float32Array(nNodes * 3);

        const idx = (ix: number, iy: number, iz: number): number =>
            ix + iy * (NX + 1) + iz * (NX + 1) * (NY + 1);

        // Populate base positions and UVs; accumulate normals by face membership
        for (let iz = 0; iz <= NZ; iz++) {
            for (let iy = 0; iy <= NY; iy++) {
                for (let ix = 0; ix <= NX; ix++) {
                    const i = idx(ix, iy, iz);
                    const b = i * 8;

                    vertices[b + 0] = ox + ix * dx - W * 0.5;
                    vertices[b + 1] = oy + iy * dy;
                    vertices[b + 2] = oz + iz * dz - D * 0.5;
                    // normals written below after accumulation
                    vertices[b + 6] = ix / NX;
                    vertices[b + 7] = iz / NZ;

                    const nb = i * 3;
                    if (iy === 0)  nrmAcc[nb + 1] = (nrmAcc[nb + 1] ?? 0) - 1;
                    if (iy === NY) nrmAcc[nb + 1] = (nrmAcc[nb + 1] ?? 0) + 1;
                    if (iz === 0)  nrmAcc[nb + 2] = (nrmAcc[nb + 2] ?? 0) - 1;
                    if (iz === NZ) nrmAcc[nb + 2] = (nrmAcc[nb + 2] ?? 0) + 1;
                    if (ix === 0)  nrmAcc[nb + 0] = (nrmAcc[nb + 0] ?? 0) - 1;
                    if (ix === NX) nrmAcc[nb + 0] = (nrmAcc[nb + 0] ?? 0) + 1;
                }
            }
        }

        // Normalize and write normals
        for (let i = 0; i < nNodes; i++) {
            const nb = i * 3;
            const nx = nrmAcc[nb + 0] ?? 0;
            const ny = nrmAcc[nb + 1] ?? 0;
            const nz = nrmAcc[nb + 2] ?? 0;
            const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
            const vb = i * 8;
            vertices[vb + 3] = nx / len;
            vertices[vb + 4] = ny / len;
            vertices[vb + 5] = nz / len;
        }

        // ── Surface triangles ────────────────────────────────────────────────
        // Winding produces outward-facing normals (CCW from outside).
        // addQuad(a,b,c,d, flip): T1={a,b,c} T2={a,c,d} — or flipped variant.

        const surfIdx: number[] = [];

        const addQuad = (a: number, b: number, c: number, d: number, flip: boolean): void => {
            if (flip) {
                surfIdx.push(a, c, b,  a, d, c);
            } else {
                surfIdx.push(a, b, c,  a, c, d);
            }
        };

        // Bottom (iy=0, outward = -Y → flip)
        for (let iz = 0; iz < NZ; iz++) {
            for (let ix = 0; ix < NX; ix++) {
                addQuad(idx(ix, 0, iz), idx(ix + 1, 0, iz), idx(ix + 1, 0, iz + 1), idx(ix, 0, iz + 1), true);
            }
        }
        // Top (iy=NY, outward = +Y)
        for (let iz = 0; iz < NZ; iz++) {
            for (let ix = 0; ix < NX; ix++) {
                addQuad(idx(ix, NY, iz), idx(ix + 1, NY, iz), idx(ix + 1, NY, iz + 1), idx(ix, NY, iz + 1), false);
            }
        }
        // Front (iz=0, outward = -Z → flip)
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                addQuad(idx(ix, iy, 0), idx(ix + 1, iy, 0), idx(ix + 1, iy + 1, 0), idx(ix, iy + 1, 0), true);
            }
        }
        // Back (iz=NZ, outward = +Z)
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                addQuad(idx(ix, iy, NZ), idx(ix + 1, iy, NZ), idx(ix + 1, iy + 1, NZ), idx(ix, iy + 1, NZ), false);
            }
        }
        // Left (ix=0, outward = -X → flip)
        for (let iz = 0; iz < NZ; iz++) {
            for (let iy = 0; iy < NY; iy++) {
                addQuad(idx(0, iy, iz), idx(0, iy + 1, iz), idx(0, iy + 1, iz + 1), idx(0, iy, iz + 1), true);
            }
        }
        // Right (ix=NX, outward = +X)
        for (let iz = 0; iz < NZ; iz++) {
            for (let iy = 0; iy < NY; iy++) {
                addQuad(idx(NX, iy, iz), idx(NX, iy + 1, iz), idx(NX, iy + 1, iz + 1), idx(NX, iy, iz + 1), false);
            }
        }

        this.rawVertices = vertices;
        this.rawIndices  = new Uint32Array(surfIdx);
        this.vertexCount = surfIdx.length;
        this.layout = new VertexLayout([
            { name: 'position', format: 'float32x3', shaderLocation: 0 },
            { name: 'normal',   format: 'float32x3', shaderLocation: 1 },
            { name: 'uv',       format: 'float32x2', shaderLocation: 2 },
        ]);
    }
}
