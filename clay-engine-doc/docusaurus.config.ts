import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

const config: Config = {
    markdown: {
        mermaid: true,
        format: 'detect',
    },
    themes: ['@docusaurus/theme-mermaid'],
    title: 'Clay Engine',
    tagline:
        'Motor 3D WebGPU em TypeScript — física XPBD, rendering PBR e partículas GPU em tempo real',
    favicon: 'img/favicon.ico',

    // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
    future: {
        v4: true, // Improve compatibility with the upcoming Docusaurus v4
    },

    // Produção: GitHub Pages do projeto (org=dantasgut, project=clayflow).
    // Ajuste `url`/`baseUrl` se publicar em domínio próprio.
    url: 'https://dantasgut.github.io',
    baseUrl: '/clayflow/',

    // GitHub pages deployment config.
    // If you aren't using GitHub pages, you don't need these.
    organizationName: 'dantasgut',
    projectName: 'clayflow',

    onBrokenLinks: 'throw',

    // Even if you don't use internationalization, you can use this field to set
    // useful metadata like html lang. For example, if your site is Chinese, you
    // may want to replace "en" with "zh-Hans".
    i18n: {
        defaultLocale: 'en',
        locales: ['en'],
    },

    stylesheets: [
        {
            href: '/katex/katex.min.css',
            type: 'text/css',
        },
    ],

    presets: [
        [
            'classic',
            {
                docs: {
                    sidebarPath: './sidebars.ts',
                    editUrl: 'https://github.com/dantasgut/clayflow/tree/develop/clay-engine-doc/',
                    remarkPlugins: [remarkMath],
                    rehypePlugins: [rehypeKatex],
                },
                blog: {
                    showReadingTime: true,
                    feedOptions: {
                        type: ['rss', 'atom'],
                        xslt: true,
                    },
                    editUrl: 'https://github.com/dantasgut/clayflow/tree/develop/clay-engine-doc/',
                    // Useful options to enforce blogging best practices
                    onInlineTags: 'warn',
                    onInlineAuthors: 'warn',
                    onUntruncatedBlogPosts: 'warn',
                },
                theme: {
                    customCss: './src/css/custom.css',
                },
            } satisfies Preset.Options,
        ],
    ],

    themeConfig: {
        // Replace with your project's social card
        image: 'img/docusaurus-social-card.jpg',
        colorMode: {
            respectPrefersColorScheme: true,
        },
        navbar: {
            title: 'Clay Engine',
            logo: {
                alt: 'Clay Engine',
                src: 'img/logo.svg',
            },
            items: [
                {
                    type: 'docSidebar',
                    sidebarId: 'tutorialSidebar',
                    position: 'left',
                    label: 'Docs',
                },
                {
                    href: 'https://github.com/dantasgut/clayflow',
                    label: 'GitHub',
                    position: 'right',
                },
            ],
        },
        footer: {
            style: 'dark',
            links: [
                {
                    title: 'Começar',
                    items: [
                        { label: 'Introdução', to: '/docs/intro' },
                        { label: 'Getting Started', to: '/docs/guides/getting_started' },
                    ],
                },
                {
                    title: 'API',
                    items: [
                        { label: 'Application', to: '/docs/api/presentation/classes/Application' },
                        { label: 'RigidBody', to: '/docs/api/elements/classes/RigidBody' },
                        { label: 'SoftBody', to: '/docs/api/elements/classes/SoftBody' },
                    ],
                },
                {
                    title: 'Física',
                    items: [
                        { label: 'FluidBody', to: '/docs/api/elements/classes/FluidBody' },
                        { label: 'XPBDFlow', to: '/docs/api/elements/classes/XPBDFlow' },
                        { label: 'LCPFlow', to: '/docs/api/elements/classes/LCPFlow' },
                    ],
                },
                {
                    title: 'Projeto',
                    items: [{ label: 'GitHub', href: 'https://github.com/dantasgut/clayflow' }],
                },
            ],
            copyright: `Copyright © ${new Date().getFullYear()} Clay Engine — dantasgut. Built with Docusaurus.`,
        },
        prism: {
            theme: prismThemes.github,
            darkTheme: prismThemes.dracula,
        },
    } satisfies Preset.ThemeConfig,

    // A API (docs/api) é gerada pelo CLI TypeDoc na raiz do repo (`npm run doc`,
    // entrypoints elements + presentation) e commitada. Não usar o plugin
    // docusaurus-plugin-typedoc aqui — evita gerador duplicado sobre o mesmo dir.
};

export default config;
