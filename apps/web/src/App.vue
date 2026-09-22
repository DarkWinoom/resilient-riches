<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue';
import { copyPlainNumbers } from './utils/clipboard.ts';
import BookkeepingPage from './BookkeepingPage.vue';
import DisabledActionHint from './components/ui/DisabledActionHint.vue';
import ToastNotice from './components/ui/ToastNotice.vue';
onMounted(() => document.addEventListener('copy', copyPlainNumbers));
onUnmounted(() => document.removeEventListener('copy', copyPlainNumbers));
</script>

<template>
  <BookkeepingPage />
  <DisabledActionHint />
  <ToastNotice />
</template>
