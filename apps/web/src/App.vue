<script setup lang="ts">
import FoundationStatus from './components/FoundationStatus.vue';
import { useHealth } from './composables/useHealth.ts';

const { state, refresh } = useHealth();
</script>

<template>
  <main class="app-shell">
    <header class="brand">
      <span class="brand-mark" aria-hidden="true">稳</span>
      <div>
        <h1>稳健生财</h1>
        <p>Resilient Riches</p>
      </div>
    </header>
    <FoundationStatus :state="state" @retry="refresh" />
    <footer>工程基础预览 · P1</footer>
  </main>
</template>
