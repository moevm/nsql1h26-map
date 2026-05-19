import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify";
import { userManager } from "../localManagers/userManager";
import { getToken } from "../auth";

let currentChart = null;
let chartData = [];

const unlogin = () => {
  document.cookie = 'token=; Path=/; SameSite=Strict; expires=Thu, 01 Jan 1970 00:00:00 UTC;';
}

const handleUnauthorized = () => {
  unlogin();
  relocateToLogin();
  userManager.delete();
};

const fetchWithAuth = async (url, options = {}) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${getToken()}`,
      ...options.headers,
    },
    credentials: 'include',
  }).catch(() => {
    Notify.error("Ошибка сервера");
    return null;
  });

  if (!response) return null;

  if (response.status === 401) {
    const data = await response.json().catch(() => ({}));
    if (data?.detail === "Invalid token") {
      handleUnauthorized();
      return null;
    }
  }

  return response;
};

const setChart = (chartCanvasElement, type, dataMetrics, metricType) => {
  const types = ["bar", "line", "radar"];
  const metricTypeLabels = {
    distance: "метра(ов)",
    walks: "штук(кол-во)",
    tiles: "штук(кол-во)"
  }
  if ((types.includes(type)) === false) return;
  if (currentChart) currentChart.destroy();

  const data = dataMetrics.length ? dataMetrics : Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().split('T')[0], value: (i+1)*10 };
  });

  const labels = [];
  const metrics = [];
  for (const item of data) {
    labels.push(item.date);
    metrics.push(item.value);
  }

  currentChart = new Chart(chartCanvasElement, {
    type: type,
    data: {
      labels: labels,
      datasets: [
        {
        label: metricTypeLabels[metricType],
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
    "walks": "Прогулки(кол)",
    "tiles": "Новые тайлы(кол)"
  }
  if ((Object.keys(metrics).includes(metric)) === false) return;
  const metricsField = document.querySelector('.stats-graph__text--metrics');
  metricsField.textContent = metrics[metric];
}

const setDurationText = (duration) => {
  const durations = {
    "0days": "Это ваша будущая статистика",
    "7": "7 дней",
    "30": "30 дней",
    "90": "90 дней",
  }
  if ((Object.keys(durations).includes(duration)) === false) return;
  const durationField = document.querySelector('.stats-graph__text--duration');
  durationField.textContent = duration === "0days" ? "Это ваша будущая статистика": `Активность за ${durations[duration]}`;
}

const setLogoModal = (logoUrl) => {
  const logo = document.querySelector('.modal__img--logo');
  logo.src = logoUrl;
}

const setAvatar = (avatarUrl) => {
  const logo = document.querySelector('.profile-data__image--logo');
  logo.src = avatarUrl;
}

const setUserName = (userName) => {
  const nickname = document.querySelector('.profile-data__nickname');
  nickname.textContent = userName;
}

const setEmail = (email) => {
  const emailElement = document
                .querySelector('.profile-data__email')
                .querySelector('.profile-data__text');
  emailElement.textContent = email;
}

const setCreatedAtTime = (date) => {
  const createdAt = document
                    .querySelector('.profile-data__date--created')
                    .querySelector('.profile-data__text--date-data');
  createdAt.textContent = date;
}

const setUpdatedAtTime = (date) => {
  const updatedAt = document
                    .querySelector('.profile-data__date--updated')
                    .querySelector('.profile-data__text--date-data');
  updatedAt.textContent = date;
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
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/stats/?userId=${userId}`);
  if (!response) return null;
  return await response.json();
};

const getStatsByMetric = async (metric, days, startDay) => {
  const userId = userManager.get().id;
  const response = await fetchWithAuth(
    `http://127.0.0.1:10001/api/stats/metrics/?userId=${userId}&metric=${metric}&days=${days}&date=${startDay}`
  );
  if (!response) return null;
  return await response.json();
};

const getUserInfo = async () => {
  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/auth/me`);
  if (!response) return null;
  return await response.json();
};

const editProfile = async ({ username, avatarUrl, email } = {}) => {
  const userId = userManager.get().id;
  const body = {};
  if (username !== undefined) body.username = username;
  if (avatarUrl !== undefined) body.avatarUrl = avatarUrl;
  if (email !== undefined) body.email = email;

  const response = await fetchWithAuth(`http://127.0.0.1:10001/api/users/${userId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response) return null;
  return await response.json();
};

document.addEventListener('DOMContentLoaded', () => {
  relocateToLogin();

  Chart.defaults.color = '#94A3B8';
  Chart.defaults.borderColor = '#00E6C3';

  const unloginBtn = document.querySelector('.profile-data__button--unlogin');
  const editProfileBtn = document.querySelector('.profile-data__button--edit');
  const closeModalBtn = document.querySelector('.modal-close');
  const cancelEditBtn = document.querySelector('.modal__btn--cancel');
  const applyEditProfileBtn = document.querySelector('.modal__btn--save');
  const applySettingsBtn = document.querySelector('.stats-settings__button');

  const chart = document.getElementById('chart');
  const graphType = document.getElementById('graph-type');
  const metricType = document.getElementById('metric-type');
  const durationData = document.getElementById('duration');

  const modalOverlay = document.querySelector('.modal-overlay');
  const modal = document.querySelector('.modal');

  const newEmailInput = document.querySelector('.modal__input--email');
  const newAvatarUrlInput = document.querySelector('.modal__input--avatar-url');
  const newUserNameInput = document.querySelector('.modal__input--username');

  newAvatarUrlInput.addEventListener('change', () => {
    setLogoModal(newAvatarUrlInput.value);
  })

  unloginBtn.addEventListener('click', () => {
    unlogin();
    relocateToLogin();
    userManager.delete();
  })

  editProfileBtn.addEventListener('click', () => {
    modal.classList.add('modal--active');
    modalOverlay.classList.add('modal-overlay--active');
  })

  closeModalBtn.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  modalOverlay.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  cancelEditBtn.addEventListener('click', () => {
    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  applyEditProfileBtn.addEventListener('click', (evt) => {
    evt.preventDefault();

    const body = {};

    if (newUserNameInput.value) body.username = newUserNameInput.value;
    if (newEmailInput.value) body.email = newEmailInput.value;
    if (newAvatarUrlInput.value) body.avatarUrl = newAvatarUrlInput.value;

    if (Object.keys(body).length === 0) {
      Notify.warning("Поля пустые!");
      return;
    }

    editProfile(body)
    .then((userData) => {
      const avatarUrl = userData.avatarUrl ? userData.avatarUrl : '/src/img/user-logo.png';
      const userName = userData.username;
      const createdAt = userData.createdAt.slice(0, 19).replace("T", " ");
      const updatedAt = userData.updatedAt.slice(0, 19).replace("T", " ");
      const email = userData.email;

      setAvatar(avatarUrl);
      setLogoModal(avatarUrl);
      setUserName(userName);
      setCreatedAtTime(createdAt);
      setUpdatedAtTime(updatedAt);
      setEmail(email);

      Notify.success("Данные успешно обновлены!");
    })
    .finally(() => {
      newUserNameInput.value = '';
      newEmailInput.value = '';
      newAvatarUrlInput.value = '';
    });

    modal.classList.remove('modal--active');
    modalOverlay.classList.remove('modal-overlay--active');
  })

  applySettingsBtn.addEventListener('click', () => {
    const graphTypeValue = graphType.value;
    const metricTypeValue = metricType.value;
    const duration = durationData.value;
    const date = new Date().toISOString().split('T')[0];
    
    getStatsByMetric(metricTypeValue, duration, date)
      .then((data) => {
        const dataMap = Object.fromEntries(data.map(d => [d.date, d.value]));
    
        chartData = Array.from({ length: duration }, (_, i) => {
          const d = new Date(date);
          d.setDate(d.getDate() - (duration - 1 - i));
          const key = d.toISOString().split('T')[0];
          return { date: key, value: dataMap[key] ?? 0 };
        });

        setChart(chart, graphTypeValue, chartData, metricTypeValue);
        setMetricsText(metricTypeValue);
        setDurationText(duration);

        Notify.success("Данные успешно обновлены");
      })
      .catch((error) => {
        Notify.error(error);
      });
  })

  setMetricsText(metricType.value);
  setDurationText(durationData.value);

  createAchievment("Профи", "/src/svg/achievment--profi.svg");
  createAchievment("Марафон", "/src/svg/achievment--walk.svg");
  createAchievment("Скаут", "/src/svg/achievment--scout.svg");
  createAchievment("Легенда", "/src/svg/achievment--legend.svg");

  getUserInfo()
    .then((userData) => {

      const avatarUrl = userData.avatarUrl ? userData.avatarUrl : '/src/img/user-logo.png';
      const userName = userData.username;
      const createdAt = userData.createdAt.slice(0, 19).replace("T", " ");
      const updatedAt = userData.updatedAt.slice(0, 19).replace("T", " ");
      const email = userData.email;

      setAvatar(avatarUrl);
      setLogoModal(avatarUrl);
      setUserName(userName);
      setCreatedAtTime(createdAt);
      setUpdatedAtTime(updatedAt);
      setEmail(email);
    });

  getStats().then((result) => {
    const bestDay = result.bestDay;

    createProfileCard("Охват", `${result.coveragePercent}%`);
    createProfileCard("Прогулки", `${result.walkCount}`);
    createProfileCard("Дни", `${result.activeDays}`);
    createProfileCard("Расстояние", `${result.totalDistance} м`);

    if (bestDay !== null) {
      const graphTypeValue = graphType.value;
      const metricTypeValue = metricType.value;
      const duration = durationData.value;
      const date = new Date().toISOString().split('T')[0];
    
      getStatsByMetric(metricTypeValue, duration, date)
        .then((data) => {
          const dataMap = Object.fromEntries(data.map(d => [d.date, d.value]));
      
          chartData = Array.from({ length: duration }, (_, i) => {
            const d = new Date(date);
            d.setDate(d.getDate() - (duration - 1 - i));
            const key = d.toISOString().split('T')[0];
            return { date: key, value: dataMap[key] ?? 0 };
          });

          setChart(chart, graphTypeValue, chartData, metricTypeValue);
          setMetricsText(metricTypeValue);
          setDurationText(duration);
        });

        createStatCard(
        "Лучший день",
        "/src/svg/stars.svg",
        `${bestDay.distance.toFixed(2)} м`,
        `${bestDay.date}`
      );

      createStatCard(
        "Среднее за прогулку",
        "/src/svg/stats.svg",
        `${result.avgDistancePerWalk.toFixed(2)} м`,
        `${result.distanceByDate[0].date}---${result.distanceByDate[ result.distanceByDate.length - 1].date}`
      );
    }else {

      setChart(chart, graphType.value, chartData, "distance");
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