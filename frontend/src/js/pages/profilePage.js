import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager";
import { getToken } from "../auth";

let currentChart = null;
let chartData = [];

const unlogin = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

const setChart = (chartCanvasElement, type, dataMetrics) => {
  const types = ["bar", "line", "radar"];
  if ((types.includes(type)) === false) return;
  if (currentChart) currentChart.destroy();

  const data = dataMetrics.length ? dataMetrics : [10, 20, 30, 40, 50, 60, 70];

  const labels = [];
  const metrics = [];
  for (const item of dataMetrics) {
    labels.push(item.date);
    metrics.push(item.distance);
  }

  currentChart = new Chart(chartCanvasElement, {
    type: type,
    data: {
      labels: labels,
      datasets: [
        {
        label: 'метр',
        data: metrics,
        borderWidth: 3
      },
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
    "distance": "Расстояние(м)",
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
    "0days": "Это ваша будущая статистика",
    "7days": "7 дней",
    "30days": "30 дней",
    "90days": "90 дней",
  }
  if ((Object.keys(durations).includes(duration)) === false && motivation === false) return;
  const durationField = document.querySelector('.stats-graph__text--duration');
  durationField.textContent = duration === "0days" ? "Это ваша будущая статистика": `Активность за ${durations[duration]}`;
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

const getStats = async () => {
  const userId = userManager.get().id;

  const response = await fetch(`http://127.0.0.1:10001/api/stats/?userId=${userId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      'credentials': true
    },
    credentials: 'include',
  }).catch((error) => {
    Notify.error("Ошибка сервера");
    return false;
  });

  const data = await response.json();
  return data;
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

    setChart(chart, graphTypeValue, chartData);
    setMetricsText(metricTypeValue);
    setDurationText(duration);

    Notify.success("Данные успешно обновлены");
  })

  setMetricsText(metricType.value);
  setDurationText(durationData.value);
  setUserName();

  createAchievment("Профи", "/src/svg/achievment--profi.svg");
  createAchievment("Марафон", "/src/svg/achievment--walk.svg");
  createAchievment("Скаут", "/src/svg/achievment--scout.svg");
  createAchievment("Легенда", "/src/svg/achievment--legend.svg");

  getStats().then((result) => {
    const bestDay = result.bestDay;

    createProfileCard("Расстояние", `${result.totalDistance} м`);
    createProfileCard("Охват", `${result.coveragePercent}%`);
    createProfileCard("Прогулки", `${result.walkCount}`);
    createProfileCard("Дни", `${result.activeDays}`);

    if (bestDay !== null) {
      chartData = result.distanceByDate;
      setChart(chart, graphType.value, result.distanceByDate);

      createStatCard(
        "Лучший день",
        "/src/svg/stars.svg",
        `${bestDay.distance} м`,
        `${bestDay.date}`
      );

      createStatCard(
        "Среднее за прогулку",
        "/src/svg/stats.svg",
        `${result.avgDistancePerWalk} м`,
        `${result.distanceByDate[0].date}---${result.distanceByDate[ result.distanceByDate.length - 1].date}`
      );
    }else {

      setChart(chart, graphType.value, chartData);
      setDurationText("0days");

      createStatCard(
        "CityTrace информация",
        "/src/svg/stars.svg",
        "Загрузите информацию о своих прогулках и получайте статистику",
        "Команда CityTrace"
      );

      applySettingsBtn.setAttribute('disabled', true);
    }
  });

})