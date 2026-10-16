// Nós de conjunto da C3 (spec 031, US3, R12): malha, pontos, primitivas paralelas e saídas — sobre o contrato da C2
// (`defineSetNode`, `GraphFlow`).
export { grid, displace, recomputeNormals } from './mesh';
export { distributeOnMesh, realizeInstances, realizeTable } from './points';
export { sequence, prefixSum, sort, compact, reduce } from './primitives';
export { meshOutput, pointsOutput } from './output';
export { MESH, POINTS, U32S, MeshTriangleSchema, SetPointSchema, SetU32Schema } from './schemas';
export { displaceHeightTarget, distributeDensityTarget } from './shaders';
