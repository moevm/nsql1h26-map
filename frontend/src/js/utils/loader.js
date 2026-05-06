import '../../css/components/loader.css';

export class Loader {
  constructor() {
    const loaderOverlay = document.createElement('div');
    loaderOverlay.className = 'loader-overlay';
    loaderOverlay.innerHTML = `
      <div class="loader-content">
        <div class="loader"></div>
        <div class="loader-text"></div>
      </div>
    `;
    return loaderOverlay;
  }
}

export const showLoader = (loader, text) => {
  const loaderTextEl = loader.querySelector('.loader-text');
  loaderTextEl.textContent = text;
  loader.style.display = 'flex';
};

export const hideLoader = (loader) => {
  loader.style.display = 'none';
};