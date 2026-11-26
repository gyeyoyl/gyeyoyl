// =====================================================
// 홈 첫 화면 (maximalestudio.com 구동 참고)
// 1) 맨 아래 큰 이름(yeomchaewon)이 한 글자씩 아래에서 올라옴
// 2) 이어서 위쪽 제목·카테고리, 오른쪽 방명록 원이 나타남
// - 큰 이름은 화면 너비에 꼭 맞게 글자 크기를 자동으로 맞춤
// =====================================================
(() => {
  const mark = document.querySelector(".mx-wordmark");
  const inner = document.querySelector(".mx-wordmark-inner");
  const hero = document.querySelector(".mx-hero");
  if (!mark || !inner || !hero) return;

  const STEP = 55;   // 글자가 하나씩 올라오는 간격 (ms)

  // 글자를 한 글자씩 나눔 (각 글자가 따로 올라오게)
  const word = inner.textContent.trim();
  inner.textContent = "";
  [...word].forEach((ch, i) => {
    const span = document.createElement("span");
    span.className = "mx-letter";
    span.textContent = ch;
    span.style.animationDelay = `${150 + i * STEP}ms`;
    inner.appendChild(span);
  });

  // 큰 이름이 화면 너비에 꽉 차도록 글자 크기 맞추기
  // (세리프체는 폭이 좁아 너비에만 맞추면 너무 커지므로, 높이는 화면의 36%까지만.
  //  그만큼 남는 폭은 글자 사이를 고르게 벌려서 양 끝을 맞춤)
  const MAX_HEIGHT = 0.36;   // 큰 이름 글자 크기 최대치 = 화면 높이 × 0.36

  // 큰 이름의 "실제 글자 잉크" 양 끝을
  //   왼쪽 = 제목 첫 글자(눈)·gyeyoyl 로고와 같은 세로선
  //   오른쪽 = 카테고리 마지막 단어(shoot)의 오른쪽 끝 세로선
  // 에 딱 맞춤. (화면이 좁아 shoot이 줄 앞쪽으로 넘어가면 화면 너비 전체에 맞춤)
  function fit() {
    const markBox = mark.getBoundingClientRect();
    if (!markBox.width) return;

    // 오른쪽 기준선: shoot 오른쪽 끝
    let target = markBox.width;
    const shoot = document.querySelector('.mx-cats [data-category="shoot"]');
    if (shoot) {
      const r = shoot.getBoundingClientRect().right - markBox.left;
      if (r > markBox.width * 0.5) target = Math.min(r, markBox.width);
    }

    // 100px 크기에서 글자 잉크 폭 재기
    inner.style.marginLeft = "0px";
    inner.style.paddingRight = "0px";
    inner.style.width = "max-content";
    inner.style.fontSize = "100px";

    const cs = getComputedStyle(inner);
    measureCtx.font = `${cs.fontWeight} 100px ${cs.fontFamily}`;
    const firstCh = word[0];
    const lastCh = word[word.length - 1];
    const mFirst = measureCtx.measureText(firstCh);
    const mLast = measureCtx.measureText(lastCh);
    const leftBear = -mFirst.actualBoundingBoxLeft;               // 첫 글자 왼쪽 빈틈 (100px 기준)
    const rightBear = mLast.width - mLast.actualBoundingBoxRight; // 마지막 글자 오른쪽 빈틈
    const ls100 = parseFloat(cs.letterSpacing) || 0;               // 자간 (100px 기준)

    const ink100 = inner.scrollWidth - leftBear - rightBear - ls100;
    if (ink100 <= 0) return;

    const byWidth = (100 * target) / ink100;
    const byHeight = window.innerHeight * MAX_HEIGHT;
    const size = Math.min(byWidth, byHeight);
    const k = size / 100;

    // 잉크 왼쪽 끝을 기준선에 붙이고, 잉크 오른쪽 끝이 shoot 끝에 오도록 폭 지정
    // (높이 제한으로 글자가 작아지면 남는 폭은 글자 사이를 고르게 벌려 맞춤)
    inner.style.fontSize = `${size}px`;
    inner.style.marginLeft = `${-leftBear * k}px`;
    inner.style.width = `${target + (leftBear + rightBear + ls100) * k}px`;

    placeNotes();
  }

  // 각주 (guestbook) / (contact)를 첫 글자 y, 마지막 글자 n 바로 위에 붙이기
  // (글꼴의 실제 글자 높이를 재서, 글자 윗선 바로 위에 놓음)
  const noteGuest = document.querySelector(".mx-note-guest");
  const noteContact = document.querySelector(".mx-note-contact");
  const measureCtx = document.createElement("canvas").getContext("2d");
  const NOTE_GAP = 4;   // 글자 윗선과 각주 사이 간격 (px)

  function placeNotes() {
    const letters = inner.querySelectorAll(".mx-letter");
    if (!letters.length || !inner.offsetWidth) return;

    const cs = getComputedStyle(inner);
    const size = parseFloat(cs.fontSize);
    const lineH = parseFloat(cs.lineHeight) || size;
    measureCtx.font = `${cs.fontWeight} ${size}px ${cs.fontFamily}`;

    const heroBox = hero.getBoundingClientRect();
    const innerBox = inner.getBoundingClientRect();
    const baseX = innerBox.left - heroBox.left;
    const baseY = innerBox.top - heroBox.top;

    // 글자 맨 윗선 위치 (각주 상자 기준)
    function glyphTop(letter) {
      const m = measureCtx.measureText(letter.textContent);
      const fa = m.fontBoundingBoxAscent || size * 0.8;
      const fd = m.fontBoundingBoxDescent || size * 0.2;
      const baseline = (lineH - (fa + fd)) / 2 + fa;
      return baseY + letter.offsetTop + baseline - m.actualBoundingBoxAscent;
    }

    const first = letters[0];
    const last = letters[letters.length - 1];

    if (noteGuest) {
      noteGuest.style.left = `${baseX + first.offsetLeft}px`;
      noteGuest.style.top = `${glyphTop(first) - noteGuest.offsetHeight - NOTE_GAP}px`;
    }

    if (noteContact) {
      const right = baseX + last.offsetLeft + last.offsetWidth;
      noteContact.style.left = `${right - noteContact.offsetWidth}px`;
      noteContact.style.top = `${glyphTop(last) - noteContact.offsetHeight - NOTE_GAP}px`;
    }
  }

  fit();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);
  let timer;
  window.addEventListener("resize", () => {
    clearTimeout(timer);
    timer = setTimeout(fit, 60);
  });
  // 홈이 숨겨져 있다가 다시 보일 때(BACK 등)도 크기 다시 맞춤
  document.addEventListener("portfolio:view", (e) => {
    if (e.detail === "home") requestAnimationFrame(fit);
  });

  // 방명록 원: 키보드(Enter / 스페이스)로도 열리게
  const ring = document.getElementById("guest-button");
  if (ring) {
    ring.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        ring.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      }
    });
  }

  // 방명록 원 안에 마우스가 들어가면 커서 옆에 'guestbook' 네모 표시가 따라다님
  if (ring && window.matchMedia("(hover: hover)").matches) {
    const tag = document.createElement("div");
    tag.className = "mx-cursor-tag";
    tag.textContent = "guestbook";
    tag.setAttribute("aria-hidden", "true");
    document.body.appendChild(tag);

    const moveTag = (e) => {
      tag.style.left = `${e.clientX}px`;
      tag.style.top = `${e.clientY}px`;
    };

    ring.addEventListener("pointerenter", (e) => {
      moveTag(e);
      tag.classList.add("is-on");
    });
    ring.addEventListener("pointermove", moveTag);
    ring.addEventListener("pointerleave", () => tag.classList.remove("is-on"));
    // 방명록으로 넘어가면 바로 숨김
    ring.addEventListener("click", () => tag.classList.remove("is-on"));
  }

  // 처음 들어올 때 한 번만 등장 효과 → 끝나면 표시
  hero.classList.add("is-intro");

  // 등장 효과가 끝나면 표시를 지움 → BACK으로 홈에 돌아올 때는 바로 보임
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  setTimeout(() => hero.classList.remove("is-intro"),
    reduce ? 0 : Math.max(150 + word.length * STEP + 900, 2200) + 100);
})();
