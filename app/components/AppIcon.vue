<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 20 })
const paths: Record<string, string> = {
  folder: 'M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8m-8 4h5',
  image: 'M3 3h18v18H3ZM8 8h.01M21 15l-5-5L5 21',
  sheet: 'M3 3h18v18H3ZM3 9h18M9 3v18M3 15h18',
  slides: 'M3 3h18M4 3v13h16V3M12 16v5m-4 0 4-3 4 3M8 8h8m-8 4h4',
  search: 'M16 16l5 5M17 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  plus: 'M12 5v14M5 12h14',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v4h16v-4',
  download: 'M12 3v13m-5-5 5 5 5-5M4 16v4h16v-4',
  grid: 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z',
  list: 'M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  trash: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  edit: 'm15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-5-5L4 14l-1 7Z',
  move: 'M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4m12-8 4 4-4 4',
  check: 'm5 12 4 4L20 5',
  close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
  'arrow-right': 'M4 12h16m-6-6 6 6-6 6',
  chevron: 'm9 5 7 7-7 7',
  down: 'm6 9 6 6 6-6',
  info: 'M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  users:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M15 3.2a4 4 0 0 1 0 7.6M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  settings:
    'm9 3-1 3-3 .6-1.5 3 2 2.4-.3 3.2 2.8 1.6L9 20h6l1-3.2 2.8-1.6-.3-3.2 2-2.4-1.5-3L16 6l-1-3ZM15 11.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  shield: 'm12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6l8-4Zm-4 9 3 3 5-5',
  lock: 'M5 10h14v11H5ZM8 10V6a4 4 0 0 1 8 0v4M12 14v3',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  refresh: 'M20 7v5h-5M4 17v-5h5M6.3 6.3a8 8 0 0 1 13.4 3.2M4.3 14.5a8 8 0 0 0 13.4 3.2',
  cloud: 'M6 18a4 4 0 0 1-1-7.9A7 7 0 0 1 18.6 9 4.5 4.5 0 0 1 18 18H6Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M9 4H3v16h6m5-13 5 5-5 5M7 12h14',
  mail: 'M3 5h18v14H3ZM3 5l9 8 9-8',
  link: 'm10 13 4-4m-6 5-2 2a4 4 0 0 0 6 6l4-4a4 4 0 0 0 0-6m0-2 2-2a4 4 0 0 0-6-6L8 6a4 4 0 0 0 0 6',
  'user-plus':
    'M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M2 21v-2a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v2m4-13v6m-3-3h6',
  drive: 'M9 4h6l7 12-3 5H5l-3-5L9 4Zm3 5-4 7h8l-4-7',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
}
</script>
<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="name === 'more' ? 4 : 1.7"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name] || paths.file" />
  </svg>
</template>
