/** Contrato de upload CPU → GPU para um collider (entrada do buffer colliders). */
export interface ColliderGpuData {
    /** mat4x4 row-major — transform mundo para collider */
    worldMat:    readonly number[];
    /** mat4x4 row-major — inverso */
    invWorldMat: readonly number[];
    /** [hx, hy, hz, offset] — half-extents ou raio + offset para plano */
    half:        readonly [number, number, number, number];
    /** 0=Sphere, 1=Box, 2=Plane */
    shapeType:   number;
    /** índice do corpo dono (-1 = estático/cinemático) */
    ownerIndex:  number;
}
