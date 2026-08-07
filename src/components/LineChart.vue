<script setup>
import { Line } from 'vue-chartjs'
import {
  Chart, Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, Filler
} from 'chart.js'

Chart.register(Title, Tooltip, Legend, LineElement, PointElement, LinearScale, CategoryScale, Filler)

defineProps({ labels: Array, data: Array, label: { type: String, default: 'Sales' } })
</script>

<template>
  <Line
    :data="{
      labels,
      datasets: [{
        label,
        data,
        borderColor: '#1e6ceb',
        backgroundColor: 'rgba(30,108,235,0.12)',
        tension: 0.35,
        fill: true,
        pointRadius: 3,
        pointBackgroundColor: '#1e6ceb'
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
