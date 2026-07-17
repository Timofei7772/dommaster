const form = document.querySelector('#estimateForm');

form.addEventListener('submit', event => {
  event.preventDefault();
  if (!form.reportValidity()) return;
  const data = new FormData(form);
  const message = [
    'Здравствуйте! Хочу предварительный расчёт ремонта.',
    '',
    `Город: ${data.get('city')}`,
    `Объект: ${data.get('object')}`,
    `Площадь: ${data.get('area')} м²`,
    `Задача: ${data.get('task')}`,
  ].join('\n');
  window.open(`https://wa.me/79174806003?text=${encodeURIComponent(message)}`, '_blank', 'noopener');
});

const gallery = document.querySelector('.gallery');
const cards = [...document.querySelectorAll('.gallery-card')];
const lightbox = document.querySelector('.lightbox');
const lightboxImage = lightbox.querySelector('img');
const lightboxCaption = lightbox.querySelector('figcaption span');
const lightboxCounter = lightbox.querySelector('figcaption b');
let activePhoto = 0;

const showPhoto = index => {
  activePhoto = (index + cards.length) % cards.length;
  const card = cards[activePhoto];
  lightboxImage.src = card.dataset.full;
  lightboxImage.alt = card.querySelector('img').alt;
  lightboxCaption.textContent = card.dataset.caption;
  lightboxCounter.textContent = `${activePhoto + 1} / ${cards.length}`;
};

cards.forEach((card, index) => card.addEventListener('click', () => {
  showPhoto(index);
  lightbox.showModal();
}));

document.querySelector('.gallery-arrow--prev').addEventListener('click', () => gallery.scrollBy({left: -gallery.clientWidth * .75, behavior: 'smooth'}));
document.querySelector('.gallery-arrow--next').addEventListener('click', () => gallery.scrollBy({left: gallery.clientWidth * .75, behavior: 'smooth'}));
lightbox.querySelector('.lightbox__close').addEventListener('click', () => lightbox.close());
lightbox.querySelector('.lightbox__nav--prev').addEventListener('click', () => showPhoto(activePhoto - 1));
lightbox.querySelector('.lightbox__nav--next').addEventListener('click', () => showPhoto(activePhoto + 1));
lightbox.addEventListener('click', event => { if (event.target === lightbox) lightbox.close(); });
document.addEventListener('keydown', event => {
  if (!lightbox.open) return;
  if (event.key === 'ArrowLeft') showPhoto(activePhoto - 1);
  if (event.key === 'ArrowRight') showPhoto(activePhoto + 1);
});

let touchStart = 0;
lightbox.addEventListener('touchstart', event => { touchStart = event.changedTouches[0].clientX; }, {passive: true});
lightbox.addEventListener('touchend', event => {
  const distance = event.changedTouches[0].clientX - touchStart;
  if (Math.abs(distance) > 50) showPhoto(activePhoto + (distance < 0 ? 1 : -1));
}, {passive: true});

// Минимальная самопроверка без фреймворков.
console.assert(form && form.elements.city && form.elements.area, 'Форма расчёта собрана некорректно');
console.assert(cards.length === 8 && lightbox, 'Галерея собрана некорректно');
