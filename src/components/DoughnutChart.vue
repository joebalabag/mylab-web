<script setup>
import { Doughnut } from 'vue-chartjs'
import { Chart, ArcElement, Tooltip, Legend } from 'chart.js'

Chart.register(ArcElement, Tooltip, Legend)

defineProps({ labels: Array, data: Array })
</script>

<template>
  <Doughnut
    :data="{
      labels,
      datasets: [{
        data,
        backgroundColor: ['#1e6ceb','#59acff','#8ecbff','#f59e0b','#10b981','#ef4444','#a855f7']
      }]
    }"
    :options="{
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: { legend: { position: 'bottom', labels: { color: '#334155', boxWidth: 12 } } }
    }"
  />
</template>
