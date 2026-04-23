import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager";

let currentChart = null;

const unlogin = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

const setChart = (chartCanvasElement, type) => {
  const types = ["bar", "line", "radar"];

  if ((types.includes(type)) === false) return;
  if (currentChart) currentChart.destroy();
  
  currentChart = new Chart(chartCanvasElement, {
    type: type,
    data: {
      labels: ['Red', 'Blue', 'Yellow', 'Green', 'Purple', 'Orange'],
      datasets: [{
        label: '# of Votes',
        data: [12, 19, 3, 5, 2, 3],
        borderWidth: 3
      }],
    },
    options: {
      scales: {
        y: {
          beginAtZero: true,
          grid: {
            display: false
          }
        },
        x: {
          grid: {
            display: false
          }
        }
      },
      plugins: {
        legend: {
          display: false
        },
      }
    }
  });
  
  return currentChart;
}

const setMetricsText = (metric) => {

  const metrics = {
    "distance": "Расстояние(км)",
    "duration": "Длительность(мин)",
    "new-zone": "Новый охват(%)",
    "speed": "Скорость(км/ч)",
    "places": "Посещённые места(кол)"
  }

  if ((Object.keys(metrics).includes(metric)) === false) return;

  const metricsField = document.querySelector('.stats-graph__text--metrics');
  metricsField.textContent = metrics[metric];
}

const setDurationText = (duration) => {

  const durations = {
    "7days": "7 дней",
    "30days": "30 дней",
    "90days": "90 дней",
  }

  if ((Object.keys(durations).includes(duration)) === false) return;

  const durationField = document.querySelector('.stats-graph__text--duration');
  durationField.textContent = `Активность за ${durations[duration]}`;
}

const setUserName = () => {
  const userData = userManager.get();
  const nickname = document.querySelector('.profile-data__nickname');
  nickname.textContent = userData.username;
}

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  Chart.defaults.color = '#94A3B8';
  Chart.defaults.borderColor = '#00E6C3';

  const unloginBtn = document.querySelector('.profile-data__button');
  const applySettingsBtn = document.querySelector('.stats-settings__button');

  const chart = document.getElementById('chart');
  const graphType = document.getElementById('graph-type');
  const metricType = document.getElementById('metric-type');
  const durationData = document.getElementById('duration');

  unloginBtn.addEventListener('click', () => {
    unlogin();
    relocateToLogin();
    userManager.delete();
  })

  applySettingsBtn.addEventListener('click', () => {
    const graphTypeValue = graphType.value;
    const metricTypeValue = metricType.value;
    const duration = durationData.value;

    setChart(chart, graphTypeValue);
    setMetricsText(metricTypeValue);
    setDurationText(duration);

    Notify.success("Данные успешно обновлены");

  })

  setChart(chart, graphType.value);
  setMetricsText(metricType.value);
  setDurationText(durationData.value);
  setUserName();

})