// ESLint v9 flat config para webgpu-engine.
//
// Camadas de regras:
//   - JS recomendadas (eslint:recommended via tseslint.configs.recommendedTypeChecked).
//   - TypeScript strict-type-checked (tipos exigidos para no-unsafe-*, no-misused-promises).
//   - Customs alinhadas com convenções do CLAUDE.md:
//       * naming-convention: proibe prefix `I` em interfaces, proibe `_` prefix em members.
//       * complexity: warn em ciclomática > 15 (catch para Flows e UIFlow gigantes).
//   - eslint-config-prettier no fim, desativando regras de formato que conflitariam com Prettier.
//
// Type-aware rules requerem `parserOptions.project` apontando para o tsconfig real.

import tseslint from 'typescript-eslint';
import prettierConfig from 'eslint-config-prettier';

export default tseslint.config(
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'clay-engine-doc/**',
            'docs/**',
            'coverage/**',
            '**/*.wgsl',
            'vitest.config.ts',
            'eslint.config.js',
            '.typedoc-cov-trash/**',
        ],
    },

    // Strict type-checked recommended set para .ts/.tsx em src/.
    ...tseslint.configs.strictTypeChecked,
    ...tseslint.configs.stylisticTypeChecked,

    {
        files: ['src/**/*.ts'],
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: './tsconfig.json',
                tsconfigRootDir: import.meta.dirname,
            },
        },
        rules: {
            // ── Convenções do projeto (CLAUDE.md) ──────────────────────────
            '@typescript-eslint/naming-convention': [
                'error',
                {
                    selector: 'interface',
                    format: ['PascalCase'],
                    custom: { regex: '^I[A-Z]', match: false },
                },
                {
                    selector: 'memberLike',
                    modifiers: ['private'],
                    format: ['camelCase'],
                    leadingUnderscore: 'forbid',
                },
                {
                    selector: 'memberLike',
                    modifiers: ['protected'],
                    format: ['camelCase'],
                    leadingUnderscore: 'forbid',
                },
                {
                    selector: 'parameter',
                    format: ['camelCase'],
                    leadingUnderscore: 'allow',
                },
                {
                    // Brand types ("__entityIdBrand", "__resourceIdBrand") são
                    // pattern canônico TS para nominal typing — aceitar
                    // double-underscore prefix em variables/types.
                    selector: ['variable', 'typeAlias'],
                    format: null,
                    filter: { regex: '^__[a-zA-Z]', match: true },
                },
                {
                    selector: 'variable',
                    format: ['camelCase', 'UPPER_CASE', 'PascalCase'],
                },
                {
                    selector: 'typeLike',
                    format: ['PascalCase'],
                },
                {
                    // FieldType enum espelha WGSL ("f32", "vec3f", "mat4x4f")
                    // por design — aceitar lowercase para enums que mapeiam
                    // tipos de shader.
                    selector: 'enumMember',
                    format: null,
                    filter: { regex: '^(f|i|u|vec|mat)[0-9]', match: true },
                },
                {
                    selector: 'enumMember',
                    format: ['PascalCase', 'UPPER_CASE'],
                },
            ],

            // ── Promise hygiene ────────────────────────────────────────────
            '@typescript-eslint/no-floating-promises': 'error',
            '@typescript-eslint/no-misused-promises': 'error',
            '@typescript-eslint/await-thenable': 'error',

            // ── Imports/exports ────────────────────────────────────────────
            '@typescript-eslint/consistent-type-imports': [
                'error',
                { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
            ],
            '@typescript-eslint/consistent-type-exports': 'error',

            // ── Misc qualidade ─────────────────────────────────────────────
            '@typescript-eslint/prefer-readonly': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'error',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            complexity: ['warn', 15],

            // ── Débito progressivo (warn, fixar em fases H-O) ─────────────
            // Mantidos como warn para visibilidade contínua sem bloquear CI.
            // Plano: fixar em batches por arquivo conforme fases tocam código.
            '@typescript-eslint/prefer-nullish-coalescing': 'warn',
            '@typescript-eslint/no-non-null-assertion': 'warn',
            '@typescript-eslint/no-unnecessary-condition': 'warn',

            // Tipo unsafe em fronteira gl-matrix / WebGPU API — débito real
            // que se elimina junto com o refactor de descriptors em fases H/J.
            '@typescript-eslint/no-unsafe-assignment': 'warn',
            '@typescript-eslint/no-unsafe-return': 'warn',
            '@typescript-eslint/no-unsafe-member-access': 'warn',
            '@typescript-eslint/no-unsafe-call': 'warn',
            '@typescript-eslint/no-unsafe-argument': 'warn',

            // Patterns aceitáveis no projeto (fix progressivo se motivado):
            '@typescript-eslint/no-confusing-void-expression': 'warn',
            '@typescript-eslint/use-unknown-in-catch-callback-variable': 'warn',
            '@typescript-eslint/no-unnecessary-type-parameters': 'warn',

            // Hooks vazios em base classes (ex: destroy()) são intencionais.
            '@typescript-eslint/no-empty-function': 'off',
            // Async sem await é comum em APIs uniformemente async — off.
            '@typescript-eslint/require-await': 'off',
            // Classes só com static é design choice ocasional — off.
            '@typescript-eslint/no-extraneous-class': 'off',
            // for-of vs for(let i): cosmético — off.
            '@typescript-eslint/prefer-for-of': 'off',
            // GPUImageDataLayout ainda em uso até upgrade @webgpu/types — warn.
            '@typescript-eslint/no-deprecated': 'warn',
            // class-literal-property-style: cosmético (readonly field vs getter),
            // sem ganho mensurável de qualidade — desligado.
            '@typescript-eslint/class-literal-property-style': 'off',

            // ── Relaxamentos pragmáticos para o stack atual ────────────────
            // O código usa `as` para narrowing em hot paths. Strict-type-checked
            // habilita no-unnecessary-type-assertion que é válido na maioria
            // dos casos; manter como warn enquanto refactor não acontece.
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            // unbound-method é útil mas conflita com o pattern de `frame.compute(label, body)`
            // onde body é arrow function literal — não é o caso problemático.
            '@typescript-eslint/unbound-method': 'off',
            // Restrict template expressions: nada a ganhar versus o código atual.
            '@typescript-eslint/restrict-template-expressions': [
                'error',
                { allowNumber: true, allowBoolean: true, allowNullish: true },
            ],
            // Cast de `as never` foi removido no PR #27 mas confirmar:
            '@typescript-eslint/no-explicit-any': 'error',
        },
    },

    // Tests podem usar non-null assertion freely (fixtures controladas).
    {
        files: ['src/**/__tests__/**/*.ts', 'src/**/*.test.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            complexity: 'off',
        },
    },

    // main.ts é smoke playground — relaxar.
    {
        files: ['src/main.ts'],
        rules: {
            '@typescript-eslint/no-non-null-assertion': 'off',
            complexity: 'off',
        },
    },

    // Prettier por último: desativa regras de formato.
    prettierConfig,
);
