export interface StencilFaceState {
    readonly compare?: GPUCompareFunction;
    readonly failOp?: GPUStencilOperation;
    readonly depthFailOp?: GPUStencilOperation;
    readonly passOp?: GPUStencilOperation;
}
