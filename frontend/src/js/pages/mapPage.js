import { relocateToLogin } from "../auth";
import { Notify } from "../utils/notify"

document.addEventListener('DOMContentLoaded', () => {
  
  const radiusSlider = document.getElementById('radius-slider');
  const avoidVisitedInput = document.getElementById('avoid-visited-toggle');
  const poiInput = document.getElementById('poi-toggle');
  const mapLayersBtns = Array.from(document.querySelectorAll('.map-layer-chip'));

  radiusSlider.addEventListener('change', (evt) => {
    const value = evt.target.value;
    const radiusText = document.getElementById('radius-value');
    radiusText.textContent = `${value}m`;
    Notify.success(`Значение радиуса охвата изменено на ${evt.target.value}м`);
  });

  avoidVisitedInput.addEventListener('change', (evt) => {
    const isChecked = evt.target.checked;
    Notify.warning(`Избегание пройденных улиц ${isChecked ? 'включено': 'выключено'}`);
  });

  poiInput.addEventListener('change', (evt) => {
    const isChecked = evt.target.checked;
    Notify.warning(`Точки интереса ${isChecked ? 'включены': 'выключены'}`);
  });

  for (const layerBtn of mapLayersBtns) {

    layerBtn.addEventListener('click', (evt) => {
      const btn = evt.currentTarget;
      const content = Array.from(btn.querySelectorAll('span'))[1].textContent;
      layerBtn.classList.toggle('map-layer-chip--active');
      const isChecked = layerBtn.classList.contains('map-layer-chip--active');
      Notify.warning(`Слои карты "${content} ${isChecked ? 'включены': 'выключены'}"`);
    })
  }

  relocateToLogin();
})