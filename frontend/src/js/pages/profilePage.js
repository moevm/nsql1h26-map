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
      datasets: [
        {
        label: '# of Votes',
        data: [12, 19, 3, 5, 2, 3],
        borderWidth: 3
      },
      {
        label: '# of Votes2',
        data: [22, 29, 23, 25, 12, 33],
        borderWidth: 5
      }
    ],
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

const createProfileCard = (title, data) => {
  const template = document.getElementById('profile-data-card-template');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.profile-data__card-header').textContent = title;
  clone.querySelector('.profile-data__card-data').textContent = data;
  document.querySelector('.profile-data__cards').appendChild(clone);
}

const createStatCard = (title, image, data, info) => {
  const template = document.getElementById('stat-card-template');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.stats-card__title').textContent = title;
  clone.querySelector('.stats-card__data').textContent = data;
  clone.querySelector('.stats-card__info').textContent = info;
  clone.querySelector('img').src = image;
  document.querySelector('.stats-cards__list').appendChild(clone);
}

const createAchievment = (title, image) => {
  const template = document.getElementById('achievment-template');
  const clone = template.content.cloneNode(true);
  clone.querySelector('.profile-data__achievment-name').textContent = title;
  clone.querySelector('.profile-data__image--achievment').src = image;
  document.querySelector('.profile-data__list').appendChild(clone);
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

  createProfileCard("Расстояние", "1.248 км");
  createProfileCard("Охват", "8.2%");
  createProfileCard("Прогулки", "242");
  createProfileCard("Дни", "14");

  createAchievment("Профи", "/src/svg/achievment--profi.svg");
  createAchievment("Марафон", "/src/svg/achievment--walk.svg");
  createAchievment("Скаут", "/src/svg/achievment--scout.svg");
  createAchievment("Легенда", "/src/svg/achievment--legend.svg");

  createStatCard(
    "Лучший день",
    "/src/svg/stars.svg",
    "18.4 км",
    "12 окт, суббота"
  );
  createStatCard(
    "Среднее за прогулку",
    "/src/svg/stats.svg",
    "5.2 км",
    "Основано на 242 записях"
  );

})