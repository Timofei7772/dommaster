const PHONE = '79174806003';

const PRICES = {
  apartment: { cosmetic: 1500, standard: 3500, capital: 5500, vip: 9000 },
  cottage: { cosmetic: 2000, standard: 4000, capital: 6500, vip: 10000 },
};

const ADDONS = {
  addElec: 800,
  addPlumb: 600,
  addHeat: 700,
  addDesign: 500,
  addFurniture: 2000,
};

const imageNames = ["media_0068f955c5b028ea.jpg","media_015d2000d303690f.jpg","media_0354de3b51e33ace.jpg","media_035895d042186dd7.jpg","media_044f3e6d2ef476f3.jpg","media_078710f9fbfaa51e.jpg","media_078c98d172750e98.jpg","media_09ffc9f32f3b8e60.jpg","media_0a908e488b3b9072.jpg","media_0c19ba425a967d92.jpg","media_1101f766d729d768.jpg","media_11a108873b3d9699.jpg","media_11c4631493939a35.jpg","media_1223982189a4ae97.jpg","media_12bd6b1286f96344.jpg","media_14325cff9e88cfdc.jpg","media_1523c38a8cf50405.jpg","media_1591e968f2608dd8.jpg","media_15edf1d21c64bb6f.jpg","media_1d00708ce2580ca7.jpg","media_1e9e12f8dee5b38b.jpg","media_202c25325eaf7460.jpg","media_211802dfef3d22a7.jpg","media_25003d61183af20b.jpg","media_2b65ef30bf38209a.jpg","media_2ba627790cde0f8f.jpg","media_2bc3edb0567e46c6.jpg","media_2db0c8bb1b20b1d3.jpg","media_2ded0126a576f9a1.jpg","media_2fe7ca0648e46d0a.jpg","media_3292e29a27228922.jpg","media_4192c4f2a61f72b5.jpg","media_41c8e9d285e1bb8d.jpg","media_41d27cc2efabbff7.jpg","media_421a37f962260b8f.jpg","media_42ae77921bc86784.jpg","media_4644338ab8aefb78.jpg","media_46d1b644249b66f5.jpg","media_475e7a7cb3ffc2b3.jpg","media_49dc1945a8457754.jpg","media_4dbbcab9f7951fd6.jpg","media_4f23af0d2efdd807.jpg","media_4f4095cc8016655d.jpg","media_4f8dec7bb9fe9397.jpg","media_4fbfd0ad2d0a8d7b.jpg","media_52f01a7d66a7ef43.jpg","media_55a63cb824581b3c.jpg","media_5d9371e636ddd5b4.jpg","media_624a551e536542ed.jpg","media_62d51107d5f9de7c.jpg","media_64075e3a6112cedf.jpg","media_64c092d0a7057198.jpg","media_6760384e84e20f20.jpg","media_67d4bf3d288fbb63.jpg","media_6a35d7e44f812d13.jpg","media_6a967f14a435454e.jpg","media_6c728e6c4466fbf4.jpg","media_6d321d1ea187125c.jpg","media_6f60fd5a93be1fb9.jpg","media_73a54ae2e11227a8.jpg","media_73d2b07dbbae03ad.jpg","media_75cffdc11df36411.jpg","media_783443928db284c5.jpg","media_78d991086de57213.jpg","media_7c2600cc95e4b3fc.jpg","media_7d20bceaf7bb1bab.jpg","media_7e004daf4a374835.jpg","media_816083e137071d35.jpg","media_82c24938ec271450.jpg","media_842cefebdb57a712.jpg","media_85e716cbd352ac18.jpg","media_88743d4441292f1f.jpg","media_89fa658b76750816.jpg","media_92a240c72b1a0627.jpg","media_9329b4be229b483f.jpg","media_969069a544c689b1.jpg","media_96f46fc38478b985.jpg","media_9b309deb5e4c20fa.jpg","media_9b9d508cef3015e2.jpg","media_a2478ba79865edf7.jpg","media_a29edb272cb149c9.jpg","media_a5681b2d10b4e686.jpg","media_a5732909aa5db777.jpg","media_a5b66490df326d70.jpg","media_a99fa52cef18abed.jpg","media_ad1692e117e8fa34.jpg","media_b0c369d88ea6549d.jpg","media_b454bff82156aecd.jpg","media_bd50ac7be859ba0a.jpg","media_bdf7640cc2839296.jpg","media_c11658f29085fea9.jpg","media_c1194ee5959c6f9d.jpg","media_c16bd490ebb8c24e.jpg","media_c209d6e232a930e6.jpg","media_c225eddefe9889ea.jpg","media_c299ffcba961957f.jpg","media_c3833762fd606112.jpg","media_c3c56b876cccbf7a.jpg","media_c5eccb30ed40e0c3.jpg","media_c6cef51cc51d86dd.jpg","media_c798095e87d3d5bc.jpg","media_c8208a793aeb7d9d.jpg","media_c97206e044f40f17.jpg","media_cc177b3560692c50.jpg","media_d0f921881043d841.jpg","media_d55d177fc1b77940.jpg","media_d5a241d51df14f4a.jpg","media_dc38c8f64f9c96a1.jpg","media_ddf2b2d262c728c9.jpg","media_df20ff5e740c3168.jpg","media_e48191ccad8210fd.jpg","media_e6da280531e24aac.jpg","media_e84d696408890aee.jpg","media_eafc5529b3ff18a6.jpg","media_edc878a941fc0a64.jpg","media_eec7aeffd77ec742.jpg","media_ef254ebea107a089.jpg","media_f04e0db3b31a48ef.jpg","media_f49a6ee61231418c.jpg","media_f6a49586110c5bdf.jpg","media_f6e1b881b03cea14.jpg","media_fa3a8655c543384a.jpg","media_fad113abf49d3348.jpg","media_fb11f385bb1ba2e6.jpg","media_fe6902cba8807bdb.jpg","photo_5300981673795194148_y.jpg","photo_5300981673795194149_y.jpg","photo_5300981673795194150_y.jpg","photo_5300981673795194160_y.jpg","photo_5300981673795194162_y.jpg","photo_5300981673795194163_y.jpg","photo_5300981673795194165_y.jpg","photo_5300981673795194166_y.jpg","photo_5300981673795194168_y.jpg","photo_5300981673795194171_y.jpg","photo_5300981673795194172_y.jpg","photo_5300981673795194179_y.jpg","photo_5300981673795194190_y.jpg","photo_5300981673795194192_y.jpg","photo_5300981673795194193_y.jpg","viewer_3ae939d912ed06ec.jpg","viewer_3f410a7db975ee3b.jpg","viewer_50d0c498db06cabd.jpg","viewer_71539fd7f422c49a.jpg","viewer_7ee967773358d217.jpg","viewer_971e25c68c0d3487.jpg","viewer_c7e98276e8ff233d.jpg","viewer_e470aaae997780ea.jpg","viewer_fa541f716cfb901e.jpg","viewer_fd7fea8a448b40ed.jpg"];

// AOS
AOS.init({ once: true, offset: 80, duration: 800 });

// Custom cursor
const cursor = document.getElementById('cursor');
const follower = document.getElementById('cursorFollower');
if (window.matchMedia('(pointer: fine)').matches) {
  document.addEventListener('mousemove', (e) => {
    cursor.style.left = e.clientX + 'px';
    cursor.style.top = e.clientY + 'px';
    follower.style.left = e.clientX + 'px';
    follower.style.top = e.clientY + 'px';
  });
  document.querySelectorAll('a, button, .service-card, .gallery__item, .calc__tab, .calc__checkbox').forEach(el => {
    el.addEventListener('mouseenter', () => follower.classList.add('hover'));
    el.addEventListener('mouseleave', () => follower.classList.remove('hover'));
  });
}

// Header scroll
let lastScroll = 0;
const header = document.getElementById('header');
window.addEventListener('scroll', () => {
  const curr = window.scrollY;
  header.classList.toggle('scrolled', curr > 80);
  lastScroll = curr;
});

// Counter animation
function animateCounters() {
  document.querySelectorAll('[data-count]').forEach(el => {
    const target = parseInt(el.dataset.count);
    const duration = 2000;
    const start = performance.now();

    function update(now) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      el.textContent = Math.floor(eased * target);
      if (progress < 1) requestAnimationFrame(update);
    }
    requestAnimationFrame(update);
  });
}

const heroObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) { animateCounters(); heroObserver.disconnect(); }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.hero-stat__num[data-count]').forEach(el => heroObserver.observe(el));

// Portfolio Swiper
const wrapper = document.getElementById('portfolioWrapper');
wrapper.innerHTML = imageNames.map((name, i) => {
  const webpName = name.replace(/\.(jpe?g|png)$/i, '.webp');
  return `<div class="swiper-slide"><img src="img/${webpName}" alt="Фото ${i + 1}" loading="lazy"></div>`;
}).join('');

new Swiper('.portfolioSwiper', {
  slidesPerView: 'auto',
  centeredSlides: true,
  spaceBetween: 24,
  loop: true,
  autoplay: { delay: 4000, disableOnInteraction: false },
  pagination: { el: '.swiper-pagination', clickable: true },
  navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
  breakpoints: {
    320: { slidesPerView: 1, spaceBetween: 12 },
    600: { slidesPerView: 2, spaceBetween: 16 },
    1024: { slidesPerView: 3, spaceBetween: 24 },
  },
});

wrapper.addEventListener('click', (e) => {
  const slide = e.target.closest('.swiper-slide');
  if (!slide) return;
  const img = slide.querySelector('img');
  if (!img) return;
  document.getElementById('modalImg').src = img.src;
  document.getElementById('modal').classList.add('active');
  document.body.style.overflow = 'hidden';
});

function closeModal() {
  document.getElementById('modal').classList.remove('active');
  document.body.style.overflow = '';
}

document.getElementById('modalClose').addEventListener('click', closeModal);
document.getElementById('modalCloseBtn').addEventListener('click', closeModal);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

// Calculator
let calcType = 'apartment';
const calcArea = document.getElementById('calcArea');
const calcAreaDisplay = document.getElementById('calcAreaDisplay');
const calcRepair = document.getElementById('calcRepair');
const calcTotalEl = document.getElementById('calcTotal');
const calcMetaEl = document.getElementById('calcMeta');
const calcOrderBtn = document.getElementById('calcOrderBtn');

document.querySelectorAll('.calc__tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.calc__tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    calcType = btn.dataset.value;
    updateCalc();
  });
});

const checkboxes = ['addElec', 'addPlumb', 'addHeat', 'addDesign', 'addFurniture']
  .map(id => document.getElementById(id));

function updateCalc() {
  const area = parseInt(calcArea.value) || 60;
  const repair = calcRepair.value;
  const pricePerM = PRICES[calcType]?.[repair] || 0;
  let total = pricePerM * area;

  checkboxes.forEach(cb => {
    if (cb.checked && ADDONS[cb.id]) total += ADDONS[cb.id] * area;
  });

  calcAreaDisplay.textContent = area;
  calcTotalEl.textContent = total.toLocaleString('ru-RU') + ' ₽';

  const repairNames = { cosmetic: 'косметика', standard: 'стандарт', capital: 'капремонт', vip: 'VIP' };
  calcMetaEl.textContent = `${area} м² · ${repairNames[repair] || repair} · ${pricePerM.toLocaleString()} ₽/м²`;
}

calcArea.addEventListener('input', updateCalc);
calcRepair.addEventListener('change', updateCalc);
checkboxes.forEach(cb => cb.addEventListener('change', updateCalc));
updateCalc();

calcOrderBtn.addEventListener('click', () => {
  const typeLabel = calcType === 'apartment' ? 'Квартира' : 'Коттедж';
  const area = calcArea.value;
  const repairNames = { cosmetic: 'Косметический', standard: 'Капитальный (стандарт)', capital: 'Капитальный (премиум)', vip: 'VIP' };
  const repair = repairNames[calcRepair.value];
  const total = calcTotalEl.textContent;
  const msg = `Здравствуйте! Интересует точный расчёт%0A%0A🏠 ${typeLabel}%0A📐 ${area} м²%0A🔧 ${repair}%0A💰 Примерно: ${total}%0A%0AРассчитайте точную смету, пожалуйста`;
  window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');
});

// Contact form — отправка на email + WhatsApp
document.getElementById('contactForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const form = e.target;
  const fd = new FormData(form);
  const name = fd.get('name');
  const phone = fd.get('phone');
  const type = fd.get('type');
  const comment = fd.get('comment');

  // Отправка на email (formsubmit.co — бесплатно, без регистрации)
  fetch('https://formsubmit.co/ajax/rsk.dommaster@inbox.ru', {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body: fd,
  }).catch(() => {});

  // WhatsApp как доп. уведомление
  const msg = `Новая заявка с сайта ДОММАСТЕР:%0A%0A👤 ${name}%0A📞 ${phone}%0A🔧 ${type || '—'}%0A💬 ${comment || '—'}`;
  window.open(`https://wa.me/${PHONE}?text=${msg}`, '_blank');

  form.reset();
  alert('✅ Заявка отправлена! Мы свяжемся с вами в ближайшее время.');
});

// Burger
const burger = document.getElementById('burger');
const nav = document.getElementById('nav');
burger.addEventListener('click', () => {
  burger.classList.toggle('active');
  nav.classList.toggle('active');
  document.body.style.overflow = nav.classList.contains('active') ? 'hidden' : '';
});

nav.querySelectorAll('a').forEach(a => {
  a.addEventListener('click', () => {
    burger.classList.remove('active');
    nav.classList.remove('active');
    document.body.style.overflow = '';
  });
});

// Legal documents
const DOCS = {
  policy: {
    title: 'Политика конфиденциальности',
    content: `
      <h2>Политика обработки персональных данных</h2>
      <p>Настоящая Политика обработки персональных данных разработана в соответствии с Федеральным законом от 27.07.2006 № 152-ФЗ «О персональных данных» (ФЗ-152).</p>

      <h3>1. Общие положения</h3>
      <p>1.1. ООО РСК «ДОММАСТЕР» (далее — Оператор) уделяет особое внимание защите персональных данных при их обработке и соблюдает требования законодательства РФ.</p>
      <p>1.2. Обработка персональных данных осуществляется на законной и справедливой основе, ограничивается достижением конкретных, заранее определённых целей.</p>

      <h3>2. Состав персональных данных</h3>
      <p>2.1. Оператор обрабатывает следующие данные: фамилия, имя, отчество; номера телефонов; адреса электронной почты; адрес объекта недвижимости.</p>
      <p>2.2. Согласие на обработку персональных данных действует до момента его отзыва.</p>

      <h3>3. Цели обработки</h3>
      <p>3.1. Персональные данные обрабатываются в целях: заключения договора на ремонтно-отделочные работы; консультирования и расчёта стоимости услуг; направления информации о ходе работ и акциях.</p>

      <h3>4. Права субъекта</h3>
      <p>4.1. Вы имеете право: получить информацию об обработке ваших данных; требовать их уточнения, блокирования или уничтожения; отозвать согласие на обработку; обжаловать действия оператора в уполномоченный орган.</p>

      <h3>5. Защита данных</h3>
      <p>5.1. Оператор принимает все необходимые правовые, организационные и технические меры для защиты персональных данных от неправомерного доступа, уничтожения, изменения, блокирования, распространения.</p>

      <p>Срок действия: бессрочно. Внесение изменений осуществляется путём публикации новой редакции на сайте.</p>
    `
  },
  offer: {
    title: 'Договор публичной оферты',
    content: `
      <h2>Договор публичной оферты на выполнение ремонтно-отделочных работ</h2>
      <p>В соответствии со статьями 435–437 Гражданского кодекса РФ настоящий документ является публичной офертой.</p>

      <h3>1. Термины</h3>
      <p>1.1. «Заказчик» — физическое или юридическое лицо, принявшее условия оферты.</p>
      <p>1.2. «Исполнитель» — ООО РСК «ДОММАСТЕР» (ИНН/ОГРН указываются в договоре).</p>
      <p>1.3. «Акцепт» — полное и безоговорочное принятие условий оферты путём подписания договора-сметы.</p>

      <h3>2. Предмет договора</h3>
      <p>2.1. Исполнитель обязуется выполнить ремонтно-отделочные работы согласно утверждённой смете, а Заказчик — принять и оплатить их.</p>
      <p>2.2. Объём, стоимость и сроки работ фиксируются в смете, являющейся неотъемлемой частью договора.</p>

      <h3>3. Порядок расчётов</h3>
      <p>3.1. Оплата производится поэтапно, согласно графику платежей, указанному в договоре.</p>
      <p>3.2. Стоимость материалов может быть оплачена авансом в размере, согласованном сторонами.</p>

      <h3>4. Гарантийные обязательства</h3>
      <p>4.1. Гарантийный срок на выполненные работы составляет от 1 до 5 лет в зависимости от вида работ.</p>
      <p>4.2. Гарантия не распространяется на дефекты, возникшие вследствие нарушения правил эксплуатации.</p>

      <h3>5. Ответственность сторон</h3>
      <p>5.1. За нарушение сроков — неустойка в соответствии с действующим законодательством РФ.</p>
      <p>5.2. Споры решаются в досудебном порядке. При недостижении согласия — в суде по месту нахождения Исполнителя.</p>
    `
  },
  advertising: {
    title: 'Информация о рекламе',
    content: `
      <h2>Информация в соответствии с ФЗ-38 «О рекламе»</h2>
      <p>Настоящий сайт содержит информацию, которая может быть признана рекламой в соответствии с Федеральным законом от 13.03.2006 № 38-ФЗ «О рекламе».</p>

      <h3>Статья 5. Общие требования к рекламе</h3>
      <p>Реклама должна быть добросовестной и достоверной. Недобросовестная реклама и недостоверная реклама не допускаются.</p>

      <h3>Раскрытие информации</h3>
      <p>ООО РСК «ДОММАСТЕР»<br>
      Регион деятельности: Республика Башкортостан (Салават, Стерлитамак, Ишимбай)<br>
      Цены, указанные на сайте, носят ознакомительный характер и не являются публичной офертой. Точная стоимость определяется после составления сметы.</p>

      <h3>Фото- и видеоматериалы</h3>
      <p>Все фото- и видеоматериалы, размещённые на сайте, являются собственностью компании, если не указано иное. Копирование и использование без согласия правообладателя запрещено.</p>

      <p>За разъяснениями обращайтесь: +7 (917) 480-60-03</p>
    `
  },
  consumer: {
    title: 'Права потребителей',
    content: `
      <h2>Права потребителей при заказе ремонтных работ</h2>
      <p>В соответствии с Законом РФ от 07.02.1992 № 2300-1 «О защите прав потребителей» (ЗоЗПП).</p>

      <h3>Статья 7. Право на безопасность</h3>
      <p>Вы имеете право на то, чтобы работы были безопасны для жизни, здоровья и имущества.</p>

      <h3>Статья 8. Право на информацию</h3>
      <p>Исполнитель обязан предоставить полную и достоверную информацию об оказываемых услугах, включая сведения о материалах, сроках и стоимости.</p>

      <h3>Статья 9. Информация об исполнителе</h3>
      <p>Мы обязаны предоставить: наименование организации, адрес, режим работы, ИНН, ОГРН, контактные данные.</p>

      <h3>Статья 10. Информация об услугах</h3>
      <p>До заключения договора вам должна быть предоставлена информация: о видах и объёме работ; о цене и порядке оплаты; о гарантийных сроках; о правилах эксплуатации результатов работ.</p>

      <h3>Статья 29. Недостатки работы</h3>
      <p>Вы вправе требовать: безвозмездного устранения недостатков; соразмерного уменьшения цены; возмещения понесённых расходов.</p>

      <p>При возникновении спорных ситуаций обращайтесь в Роспотребнадзор или суд.</p>
    `
  }
};

function openDoc(type) {
  const doc = DOCS[type];
  if (!doc) return;
  document.getElementById('docContent').innerHTML = doc.content;
  document.getElementById('docModal').classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeDoc() {
  document.getElementById('docModal').classList.remove('active');
  document.body.style.overflow = '';
}

document.querySelectorAll('.docs__card').forEach(card => {
  card.addEventListener('click', () => openDoc(card.dataset.doc));
});

document.getElementById('docModalClose').addEventListener('click', closeDoc);
document.getElementById('docModalCloseBtn').addEventListener('click', closeDoc);

// FAQ accordion
document.querySelectorAll('.faq__question').forEach(q => {
  q.addEventListener('click', () => {
    const item = q.closest('.faq__item');
    const isActive = item.classList.contains('active');
    document.querySelectorAll('.faq__item').forEach(i => i.classList.remove('active'));
    if (!isActive) item.classList.add('active');
  });
});
