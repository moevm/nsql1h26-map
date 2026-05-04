export const initSlider = (trackId, prevBtnId, nextBtnId, onSlideChange) => {
  const track = document.getElementById(trackId);
  const prevBtn = document.getElementById(prevBtnId);
  const nextBtn = document.getElementById(nextBtnId);
  let currentSlide = 0;
  const slides = track.querySelectorAll('.slider-slide');
  const totalSlides = slides.length;

  const updateSlider = () => {
    track.style.transform = `translateX(-${currentSlide * 100}%)`;
    prevBtn.disabled = currentSlide === 0;
    nextBtn.disabled = currentSlide === totalSlides - 1;
    onSlideChange(currentSlide);
  };

  const goTo = (index) => {
    if (index >= 0 && index < totalSlides) {
      currentSlide = index;
      updateSlider();
    }
  };

  prevBtn.addEventListener('click', () => { if (currentSlide > 0) { currentSlide--; updateSlider(); } });
  nextBtn.addEventListener('click', () => { if (currentSlide < totalSlides - 1) { currentSlide++; updateSlider(); } });
  updateSlider();

  return { goTo, getCurrentSlide: () => currentSlide };
};