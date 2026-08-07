<script setup>
import { Bar } from 'vue-chartjs'
import {
  Chart, Title, Tooltip, Legend, BarElement, LinearScale, CategoryScale
} from 'chart.js'

Chart.register(Title, Tooltip, Legend, BarElement, LinearScale, CategoryScale)

defineProps({ labels: Array, data: Array, label: { type: String, default: '' } })
</script>

<template>
  <Bar
    :data="{
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: '#59acff',
        borderRadius: 6,
        maxBarThickness: 28
      }]
    }"
    :options="{
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { color: '#64748b' }, grid: { color: '#e2e8f0' } },
        x: { ticks: { color: '#64748b' }, grid: { display: false } }
      }
    }"
  />
</template>
