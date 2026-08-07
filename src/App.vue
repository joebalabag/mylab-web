<script setup>
import { RouterView } from 'vue-router'
import WarningsToast from './components/WarningsToast.vue'
</script>

<template>
  <RouterView />
  <WarningsToast />
</template>
