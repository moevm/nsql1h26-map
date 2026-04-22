import { relocateToLogin } from "../auth";

let currentChart = null;

const unlogin = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

const getChart = (chartCanvasElement, type) => {
  
  const types = ["bar", "line"]
  let isCorrectType = false;

  for (const item of types) {
    if (type === item) {
      isCorrectType = true;
      break;
    };
  }

  if (!isCorrectType) return;

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

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  Chart.defaults.color = '#94A3B8';
  Chart.defaults.borderColor = '#00E6C3';

  const unloginBtn = document.querySelector('.profile-data__button');
  const applySettingsBtn = document.querySelector('.stats-settings__button');
  const chart = document.getElementById('chart');
  const graphType = document.getElementById('graph-type');

  const currentChartType = graphType.value;

  unloginBtn.addEventListener('click', () => {
    unlogin();
    relocateToLogin();
  })

  applySettingsBtn.addEventListener('click', () => {
    const graphTypeValue = graphType.value;
    getChart(chart, graphTypeValue);
  })

  getChart(chart, currentChartType);
})