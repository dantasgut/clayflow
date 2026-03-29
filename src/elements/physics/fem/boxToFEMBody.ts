/**
 * boxToFEMBody — tessellador de caixa para malha tetraédrica FEM.
 *
 * Gera nós e elementos para um `FEMBody` a partir de uma caixa parametrizada.
 * O índice do nó segue o mesmo layout de `FEMBoxGeometry`:
 *
 *   idx(ix, iy, iz) = ix + iy*(cellsX+1) + iz*(cellsX+1)*(cellsY+1)
 *
 * Cada célula hexaédrica é decomposta em 6 tetraedros via decomposição Fan
 * ao longo da diagonal principal v0–v7:
 *
 *   T1: {v0, v1, v3, v7}   T4: {v0, v6, v4, v7}
 *   T2: {v0, v3, v2, v7}   T5: {v0, v4, v5, v7}
 *   T3: {v0, v2, v6, v7}   T6: {v0, v5, v1, v7}
 *
 * onde v0=corner(ix,iy,iz), v1=corner(ix+1,iy,iz), ..., v7=corner(ix+1,iy+1,iz+1).
 * A decomposição Fan produz 6 tetraedros de volume igual = (dx*dy*dz)/6 cada,
 * e é compatível com o cálculo de D_m_inv em FEMComputePass.
 *
 * Parâmetros de ancoragem (`pinnedBottom`):
 *   Nós na face inferior (iy=0) recebem `w=0` (invMass=0 → cinemáticos).
 *   Útil para ancorar o corpo a uma superfície estática.
 *   Se `false`, todos os nós são livres (w=1).
 */

import type { FEMNode, FEMTetrahedron } from '../FEMBody';

export interface BoxFEMResult {
    nodes:    FEMNode[];
    elements: FEMTetrahedron[];
}

export interface BoxFEMOptions {
    offsetX?:      number;
    offsetY?:      number;
    offsetZ?:      number;
    /** Pina os nós da face inferior (iy=0) — invMass=0. Default: false. */
    pinnedBottom?: boolean;
}

/**
 * Gera uma malha tetraédrica FEM para uma caixa axis-aligned.
 *
 * @param width   extensão em X (metros)
 * @param height  extensão em Y (metros)
 * @param depth   extensão em Z (metros)
 * @param cellsX  número de células em X
 * @param cellsY  número de células em Y
 * @param cellsZ  número de células em Z
 * @param opts    opções de offset e ancoragem
 */
export function boxToFEMBody(
    width:   number,
    height:  number,
    depth:   number,
    cellsX:  number,
    cellsY:  number,
    cellsZ:  number,
    opts:    BoxFEMOptions = {},
): BoxFEMResult {
    const { offsetX = 0, offsetY = 0, offsetZ = 0, pinnedBottom = false } = opts;

    const NX = cellsX;
    const NY = cellsY;
    const NZ = cellsZ;
    const dx = width  / NX;
    const dy = height / NY;
    const dz = depth  / NZ;

    // ── Nós ────────────────────────────────────────────────────────────────────

    const idx = (ix: number, iy: number, iz: number): number =>
        ix + iy * (NX + 1) + iz * (NX + 1) * (NY + 1);

    const nodes: FEMNode[] = [];

    for (let iz = 0; iz <= NZ; iz++) {
        for (let iy = 0; iy <= NY; iy++) {
            for (let ix = 0; ix <= NX; ix++) {
                nodes.push({
                    x:  offsetX + ix * dx - width  * 0.5,
                    y:  offsetY + iy * dy,
                    z:  offsetZ + iz * dz - depth  * 0.5,
                    vx: 0,
                    vy: 0,
                    vz: 0,
                    // w=0 → pinned (invMass=0); w=1 → free
                    w: (pinnedBottom && iy === 0) ? 0 : 1,
                });
            }
        }
    }

    // ── Elementos (6 tetraedros por célula) ────────────────────────────────────
    //
    // Fan decomposition ao longo da diagonal v0–v7 (Freudenthal simplex).
    // Os 6 vértices intermediários formam o ciclo:
    //   v1 → v3 → v2 → v6 → v4 → v5 → v1 (arestas adjacentes a v0 e v7).

    const elements: FEMTetrahedron[] = [];

    for (let iz = 0; iz < NZ; iz++) {
        for (let iy = 0; iy < NY; iy++) {
            for (let ix = 0; ix < NX; ix++) {
                const v0 = idx(ix,     iy,     iz    );
                const v1 = idx(ix + 1, iy,     iz    );
                const v2 = idx(ix,     iy + 1, iz    );
                const v3 = idx(ix + 1, iy + 1, iz    );
                const v4 = idx(ix,     iy,     iz + 1);
                const v5 = idx(ix + 1, iy,     iz + 1);
                const v6 = idx(ix,     iy + 1, iz + 1);
                const v7 = idx(ix + 1, iy + 1, iz + 1);

                // 6 tetraedros do fan v0–v7
                elements.push({ n0: v0, n1: v1, n2: v3, n3: v7 });
                elements.push({ n0: v0, n1: v3, n2: v2, n3: v7 });
                elements.push({ n0: v0, n1: v2, n2: v6, n3: v7 });
                elements.push({ n0: v0, n1: v6, n2: v4, n3: v7 });
                elements.push({ n0: v0, n1: v4, n2: v5, n3: v7 });
                elements.push({ n0: v0, n1: v5, n2: v1, n3: v7 });
            }
        }
    }

    return { nodes, elements };
}
