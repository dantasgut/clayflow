export interface MultisampleSpec {
    readonly count?: 1 | 4;
    readonly mask?: number;
    readonly alphaToCoverageEnabled?: boolean;
}
