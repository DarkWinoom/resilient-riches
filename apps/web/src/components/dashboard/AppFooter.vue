<script setup lang="ts">
import AppIcon from '../ui/AppIcon.vue';
import { version } from '../../../package.json';
</script>
<template>
  <footer class="site-footer">
    <a href="https://github.com/DarkWinoom" target="_blank" rel="noopener noreferrer"
      ><span class="footer-emblem"><AppIcon name="chart-line-up" /></span
      ><span>Resilient Riches @2026 by <strong>DarkWinoom</strong></span></a
    >
    <div>
      <a
        class="version-badge"
        :href="`https://github.com/DarkWinoom/resilient-riches/releases/tag/v${version}`"
        target="_blank"
        rel="noopener noreferrer"
        >v{{ version }}</a
      >
      <a
        href="https://github.com/DarkWinoom/resilient-riches/blob/main/LICENSE"
        target="_blank"
        rel="noopener noreferrer"
        >MIT License</a
      ><span class="footer-divider"></span
      ><a
        href="https://github.com/DarkWinoom/resilient-riches"
        target="_blank"
        rel="noopener noreferrer"
        ><AppIcon name="github-logo" />GitHub<AppIcon name="arrow-up-right"
      /></a>
    </div>
  </footer>
</template>
