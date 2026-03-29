/**
 * FEMBufferLayout — contratos de naming, tamanho e serialização dos buffers GPU do FEM.
 *
 * Análogo a SoftBodyBufferLayout para o subsistema de elementos finitos.
 * Centraliza:
 *   - IDs de buffer (via buildFEMBufferIds)
 *   - Tamanhos em bytes
 *   - Serialização CPU→GPU (funções pack*)
 *
 * ## Strides
 *
 * Nó (Particle WGSL): 3 × vec4f = 48 bytes = 12 floats
 *   pos.xyz + invMass | pred.xyz + pad | vel.xyz + pad
 *
 * Elemento (FEMElement WGSL): 7 × vec4f = 112 bytes = 28 floats / 7 uint-floats
 *   node_indices (4×u32) | Bm_col0 (4×f32) | Bm_col1 (4×f32) | Bm_col2 (4×f32)
 *   lambdas (4×f32) | _pad0 (4×f32) | _pad1 (4×f32)
 */

// ── Strides ───────────────────────────────────────────────────────────────────

/** Bytes por nó (Particle: 3 × vec4f). */
export const FEM_NODE_STRIDE_BYTES  = 48;
/** Floats por nó. */
export const FEM_NODE_STRIDE_FLOATS = 12;

/** Bytes por elemento (FEMElement: 7 × vec4f). */
export const FEM_ELEM_STRIDE_BYTES  = 112;
/** 32-bit words por elemento. */
export const FEM_ELEM_STRIDE_WORDS  = 28;

/** Bytes de um uniform buffer de ColorRange (vec4u). */
export const FEM_COLOR_RANGE_BYTES  = 16;

/** Bytes do uniform FEMSimParams. */
export const FEM_SIM_PARAMS_BYTES   = 80;

// ── Offsets nos nós (Float32Array view) ──────────────────────────────────────

export const FN_POS_X    = 0;
export const FN_POS_Y    = 1;
export const FN_POS_Z    = 2;
export const FN_INV_MASS = 3;
export const FN_PRED_X   = 4;
export const FN_PRED_Y   = 5;
export const FN_PRED_Z   = 6;
// [7] = pred.w (reservado)
export const FN_VEL_X    = 8;
export const FN_VEL_Y    = 9;
export const FN_VEL_Z    = 10;
// [11] = vel.w (reservado)

// ── Offsets nos elementos (words) ─────────────────────────────────────────────
// Words 0-3: node_indices (u32)
export const FE_N0 = 0;
export const FE_N1 = 1;
export const FE_N2 = 2;
export const FE_N3 = 3;
// Words 4-7: Bm_col0 (f32: c0x, c0y, c0z, rest_volume)
export const FE_BMC0_X      = 4;
export const FE_BMC0_Y      = 5;
export const FE_BMC0_Z      = 6;
export const FE_REST_VOLUME = 7;
// Words 8-11: Bm_col1 (f32: c1x, c1y, c1z, mu_local)
export const FE_BMC1_X    = 8;
export const FE_BMC1_Y    = 9;
export const FE_BMC1_Z    = 10;
export const FE_MU_LOCAL  = 11;
// Words 12-15: Bm_col2 (f32: c2x, c2y, c2z, lambda_local)
export const FE_BMC2_X       = 12;
export const FE_BMC2_Y       = 13;
export const FE_BMC2_Z       = 14;
export const FE_LAMBDA_LOCAL = 15;
// Words 16-19: lambdas (f32: lambda_h, lambda_d, pad, pad)
export const FE_LAMBDA_H = 16;
export const FE_LAMBDA_D = 17;

// ── Buffer IDs por instância ──────────────────────────────────────────────────

export interface FEMBufferIds {
    simParamsId:  string;
    nodesId:      string;
    elementsId:   string;
    colorRangeIds: string[];
    colorCounts:  number[];
}

export function buildFEMBufferIds(uuid: string): FEMBufferIds {
    return {
        simParamsId:   `gpu_fem_simparams_${uuid}`,
        nodesId:       `gpu_fem_nodes_${uuid}`,
        elementsId:    `gpu_fem_elements_${uuid}`,
        colorRangeIds: [],
        colorCounts:   [],
    };
}

export function buildFEMColorRangeId(uuid: string, colorIndex: number): string {
    return `gpu_fem_color_range_${uuid}_${colorIndex}`;
}

// ── Serialização CPU → GPU ────────────────────────────────────────────────────

export interface FEMNodeData {
    x: number; y: number; z: number;
    vx: number; vy: number; vz: number;
    invMass: number;
}

/**
 * Serializa os nós de um FEMBody em Float32Array.
 *
 * @param nodes    array de nós com posição, velocidade e massa inversa
 * @param out      Float32Array de destino, tamanho >= nodes.length × FEM_NODE_STRIDE_FLOATS
 */
export function packFEMNodes(nodes: FEMNodeData[], out: Float32Array): void {
    for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i]!;
        const b = i * FEM_NODE_STRIDE_FLOATS;
        out[b + FN_POS_X]    = n.x;
        out[b + FN_POS_Y]    = n.y;
        out[b + FN_POS_Z]    = n.z;
        out[b + FN_INV_MASS] = n.invMass;
        out[b + FN_PRED_X]   = n.x;   // pred = pos na inicialização
        out[b + FN_PRED_Y]   = n.y;
        out[b + FN_PRED_Z]   = n.z;
        // [7] pad = 0
        out[b + FN_VEL_X]    = n.vx;
        out[b + FN_VEL_Y]    = n.vy;
        out[b + FN_VEL_Z]    = n.vz;
        // [11] pad = 0
    }
}

export interface FEMElementData {
    /** Índices dos 4 nós do tetraedro. */
    n0: number; n1: number; n2: number; n3: number;
    /** Colunas da inversa da shape matrix de repouso D_m_inv. */
    Bm_col0: [number, number, number];
    Bm_col1: [number, number, number];
    Bm_col2: [number, number, number];
    /** Volume de repouso = (1/6) × |det(D_m)|. */
    restVolume: number;
    /** Parâmetros de material por elemento (permitem heterogeneidade). */
    mu:     number;
    lambda: number;
}

/**
 * Serializa elementos tetraédricos em views duplas (f32 e u32) sobre o mesmo ArrayBuffer.
 * `f32` e `u32` devem apontar para o mesmo `ArrayBuffer`.
 *
 * @param elems  array de elementos
 * @param f32    Float32Array para campos numéricos
 * @param u32    Uint32Array para índices de nós
 */
export function packFEMElements(
    elems: FEMElementData[],
    f32:   Float32Array,
    u32:   Uint32Array,
): void {
    for (let k = 0; k < elems.length; k++) {
        const e = elems[k]!;
        const b = k * FEM_ELEM_STRIDE_WORDS;

        // node_indices (u32)
        u32[b + FE_N0] = e.n0;
        u32[b + FE_N1] = e.n1;
        u32[b + FE_N2] = e.n2;
        u32[b + FE_N3] = e.n3;

        // Bm_col0 + rest_volume (f32)
        f32[b + FE_BMC0_X]      = e.Bm_col0[0];
        f32[b + FE_BMC0_Y]      = e.Bm_col0[1];
        f32[b + FE_BMC0_Z]      = e.Bm_col0[2];
        f32[b + FE_REST_VOLUME] = e.restVolume;

        // Bm_col1 + mu_local (f32)
        f32[b + FE_BMC1_X]   = e.Bm_col1[0];
        f32[b + FE_BMC1_Y]   = e.Bm_col1[1];
        f32[b + FE_BMC1_Z]   = e.Bm_col1[2];
        f32[b + FE_MU_LOCAL] = e.mu;

        // Bm_col2 + lambda_local (f32)
        f32[b + FE_BMC2_X]       = e.Bm_col2[0];
        f32[b + FE_BMC2_Y]       = e.Bm_col2[1];
        f32[b + FE_BMC2_Z]       = e.Bm_col2[2];
        f32[b + FE_LAMBDA_LOCAL] = e.lambda;

        // lambdas inicializados em zero (warm start começa zerado)
        f32[b + FE_LAMBDA_H] = 0;
        f32[b + FE_LAMBDA_D] = 0;
        // pad words 18-27 são 0 por default do ArrayBuffer
    }
}

/**
 * Serializa um ColorRange no uniform buffer.
 *
 * @param offset índice do primeiro elemento desta cor no buffer global
 * @param count  número de elementos desta cor
 * @param u32    Uint32Array[4] de destino
 */
export function packFEMColorRange(offset: number, count: number, u32: Uint32Array): void {
    u32[0] = offset;
    u32[1] = count;
    u32[2] = 0;
    u32[3] = 0;
}
