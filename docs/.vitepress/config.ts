import { defineConfig } from "vitepress";

const repo = "https://github.com/getclarvis/agent-skills";
const site = "https://agent-skills.clarvis.dev";

const description =
  "Discover, parse, merge, and serve Claude-Code / opencode-style SKILL.md skills for an LLM agent — a pure-ESM leaf library with progressive disclosure (catalog / body / resources).";

// Shared sidebar groups — referenced from every per-section sidebar so the mode-agnostic pages
// (reference, concepts, operations) live as single files but appear in each sidebar.
const startedGroup = {
  text: "Getting started",
  collapsed: false,
  items: [{ text: "Introduction & quickstart", link: "/getting-started" }],
};

const guideGroup = {
  text: "Guide",
  collapsed: false,
  items: [
    { text: "Overview", link: "/guide/" },
    { text: "Embed in an agent", link: "/guide/embed-in-an-agent" },
    { text: "Discovery & precedence", link: "/guide/discovery-and-precedence" },
    { text: "Progressive disclosure", link: "/guide/progressive-disclosure" },
  ],
};

const referenceGroup = {
  text: "Reference",
  collapsed: false,
  items: [
    { text: "createAgentSkills", link: "/reference/create-agent-skills" },
    { text: "Configuration", link: "/reference/configuration" },
    { text: "The API", link: "/reference/api" },
    { text: "The catalog export", link: "/reference/catalog" },
    { text: "Error codes", link: "/reference/error-codes" },
  ],
};

const conceptsGroup = {
  text: "Concepts",
  collapsed: false,
  items: [
    { text: "How it works", link: "/explanation/how-it-works" },
    { text: "The SKILL.md format", link: "/explanation/the-skill-format" },
    { text: "Resource confinement", link: "/explanation/resource-confinement" },
  ],
};

const operationsGroup = {
  text: "Operations & security",
  collapsed: false,
  items: [{ text: "Deploy securely", link: "/operations/deploy-securely" }],
};

const sidebar = [startedGroup, guideGroup, referenceGroup, conceptsGroup, operationsGroup];

export default defineConfig({
  lang: "en-US",
  title: "@clarvis/agent-skills",
  description,

  // Served at the root of the agent-skills.clarvis.dev subdomain.
  // If you ever preview on a GitHub project path (user.github.io/agent-skills/),
  // change this to "/agent-skills/".
  base: "/",

  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  // docs/README.md (if present) stays as the GitHub folder index; the site home is docs/index.md.
  // _partials/ holds @include fragments shared across pages — never built as standalone pages.
  srcExclude: ["README.md", "**/_partials/**"],

  sitemap: { hostname: site },

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#5b54e8" }],
    ["meta", { name: "author", content: "Clarvis" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "@clarvis/agent-skills" }],
    ["meta", { property: "og:title", content: "@clarvis/agent-skills" }],
    ["meta", { property: "og:description", content: description }],
    ["meta", { property: "og:url", content: `${site}/` }],
    ["meta", { property: "og:image", content: `${site}/og.svg` }],
    ["meta", { name: "twitter:card", content: "summary_large_image" }],
    ["meta", { name: "twitter:title", content: "@clarvis/agent-skills" }],
    ["meta", { name: "twitter:description", content: description }],
    ["meta", { name: "twitter:image", content: `${site}/og.svg` }],
  ],

  themeConfig: {
    logo: { src: "/logo.svg", alt: "@clarvis/agent-skills" },
    siteTitle: "@clarvis/agent-skills",

    nav: [
      { text: "Guide", link: "/guide/", activeMatch: "/guide/" },
      { text: "Reference", activeMatch: "/reference/", items: referenceGroup.items },
      { text: "Concepts", activeMatch: "/explanation/", items: conceptsGroup.items },
      { text: "Operations", link: "/operations/deploy-securely", activeMatch: "/operations/" },
      {
        text: "v0.1.0",
        items: [
          { text: "npm", link: "https://www.npmjs.com/package/@clarvis/agent-skills" },
          { text: "SPEC.md", link: `${repo}/blob/main/SPEC.md` },
          { text: "License", link: `${repo}/blob/main/LICENSE` },
        ],
      },
      { text: "clarvis.dev", link: "https://clarvis.dev" },
    ],

    sidebar: {
      "/": sidebar,
    },

    outline: { level: [2, 3], label: "On this page" },

    search: { provider: "local" },

    socialLinks: [
      { icon: "github", link: repo },
      { icon: "npm", link: "https://www.npmjs.com/package/@clarvis/agent-skills" },
    ],

    editLink: {
      pattern: `${repo}/edit/main/docs/:path`,
      text: "Edit this page on GitHub",
    },

    lastUpdated: {
      text: "Last updated",
      formatOptions: { dateStyle: "medium" },
    },

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © 2026 Clarvis",
    },
  },
});
