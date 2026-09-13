<script setup lang="ts">
defineProps<{ name: string }>();
</script>
<template><i :class="['ph-light', `ph-${name}`]" aria-hidden="true"></i></template>
