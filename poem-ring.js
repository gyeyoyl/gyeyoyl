// =====================================================
// 홈 제목: 글이 입체 고리를 따라 시계 방향으로 천천히 도는 모션
// (참고: spacetypegenerator.com 기본 모드 v.CYLINDER)
// - 글자를 고리 둘레에 하나씩 세우고, 고리 전체를 CSS 애니메이션으로 돌림
// - 어두운 카테고리 칸(text, shoot) 위를 지날 때는 그 칸의 글씨색(흰색/분홍)으로 보이게
//   같은 고리를 한 겹 더 만들어 그 칸 모양으로만 잘라 위에 겹침
// =====================================================
(() => {
  // 고리에 반복해서 들어갈 글 (줄 사이는 띄어쓰기 한 칸)
  const TEXT =
    "눈 내리는 날, 수요일, 이십오 년 동안의, 서스펜스 " +
    "시간은 시간이고 일기는 일기이며 정박된 시간, " +
    "그것을 발산, 발산하기 " +
    "창문이 희어지는 순간을 목도하기 " +
    "당신이 당신 사랑을 숨기는 이유를 이해하고 싶다 " +
    "focus journal poem error and";

  const ring = document.querySelector(".poem-ring");
  if (!ring) return;

  const measure = document.createElement("canvas").getContext("2d");
  let lastWidth = 0;
  let glyphs = [];        // [{ ch, transform }]
  let radius = 0;
  let glyphScale = 1;
  let glyphFontSize = "";   // 글자를 줄여야 할 때만 값이 생김

  // 고리 한 겹 만들기
  function makeLayer() {
    const layer = document.createElement("div");
    layer.className = "poem-ring-layer";
    const spin = document.createElement("div");
    spin.className = "poem-ring-spin";
    layer.appendChild(spin);
    return layer;
  }

  // 기본 고리 (진한 글씨)
  const base = makeLayer();
  ring.appendChild(base);

  // 어두운 카테고리 칸마다 덧씌울 고리
  const darkTiles = [...document.querySelectorAll(".category-tile")].filter((tile) => {
    const m = getComputedStyle(tile).backgroundColor.match(/\d+/g);
    if (!m) return false;
    const [r, g, b] = m.map(Number);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 < 0.3;
  });
  const overlays = darkTiles.map((tile) => {
    const layer = makeLayer();
    layer.classList.add("is-overlay");
    layer.style.color = getComputedStyle(tile).color;   // text 칸 = 흰색, shoot 칸 = 분홍
    ring.appendChild(layer);
    // 칸에 마우스를 올리면 칸이 분홍으로 바뀌므로 그동안은 덧씌운 고리를 숨김
    tile.addEventListener("mouseenter", () => { layer.style.visibility = "hidden"; });
    tile.addEventListener("mouseleave", () => { layer.style.visibility = ""; });
    return { tile, layer };
  });

  function buildGlyphs() {
    const width = ring.clientWidth;
    if (!width || width === lastWidth) return false;
    lastWidth = width;
    radius = width / 2;

    // 단어 단위로 배치 (글꼴 본래의 글자 간격·쉼표 위치가 그대로 유지됨)
    // 폭은 실제 화면 글꼴로 그려 보고 잼
    const spin = base.firstChild;
    spin.style.fontSize = "";
    const fontSize = parseFloat(getComputedStyle(spin).fontSize);
    const words = TEXT.split(" ");
    // 돌고 있는 고리 밖(회전 영향 없는 곳)에서 같은 글꼴로 폭을 잼
    // (고리 안에서 재면 비스듬히 돌아간 순간 폭이 좁게 재져서 단어가 겹침)
    const spinStyle = getComputedStyle(spin);
    const letterSpacing = getComputedStyle(spin.querySelector("span") || spin).letterSpacing;
    const probe = document.createElement("div");
    probe.setAttribute("aria-hidden", "true");
    probe.style.cssText =
      "position:absolute;left:-9999px;top:0;visibility:hidden;white-space:nowrap;pointer-events:none;" +
      `font-family:${spinStyle.fontFamily};font-size:${spinStyle.fontSize};font-weight:${spinStyle.fontWeight};` +
      `letter-spacing:${letterSpacing === "normal" ? "-0.03em" : letterSpacing};`;
    document.body.appendChild(probe);
    const measureText = (text) => {
      const span = document.createElement("span");
      span.textContent = text;
      probe.appendChild(span);
      return span.getBoundingClientRect().width;
    };
    let wordWidths = words.map(measureText);
    let space = fontSize * 0.18;   // 단어 사이 간격 (글자 크기의 0.18배)
    probe.remove();

    let textWidth = wordWidths.reduce((a, b) => a + b, 0) + space * (words.length - 1);

    // 고리 둘레에 글이 몇 번 들어가는지 (반복 사이 최소 여백 3em)
    // 남는 길이는 반복 사이 여백으로 나눔
    const circumference = 2 * Math.PI * radius;
    let minGap = fontSize * 3;

    // 고리가 작아서(휴대폰) 글이 한 바퀴에 다 안 들어가면, 들어가도록 글자 크기를 줄임
    glyphScale = Math.min(1, circumference / (textWidth + minGap));
    if (glyphScale < 1) {
      wordWidths = wordWidths.map((w) => w * glyphScale);
      space *= glyphScale;
      textWidth *= glyphScale;
      minGap *= glyphScale;
    }
    glyphFontSize = glyphScale < 1 ? `${(fontSize * glyphScale).toFixed(2)}px` : "";

    const repeats = Math.max(1, Math.floor(circumference / (textWidth + minGap)));
    const gap = (circumference - repeats * textWidth) / repeats;

    glyphs = [];
    let along = 0;
    for (let r = 0; r < repeats; r++) {
      words.forEach((word, i) => {
        const w = wordWidths[i];
        const angle = ((along + w / 2) / radius) * (180 / Math.PI);
        glyphs.push({ ch: word, transform: `rotateY(${angle.toFixed(3)}deg) translateZ(${radius}px) translate(-50%, -50%)` });
        along += w + (i < words.length - 1 ? space : 0);
      });
      along += gap;
    }
    return true;
  }

  function fill(layer) {
    const frag = document.createDocumentFragment();
    glyphs.forEach((g) => {
      const span = document.createElement("span");
      span.textContent = g.ch;
      span.style.transform = g.transform;
      frag.appendChild(span);
    });
    layer.firstChild.style.fontSize = glyphFontSize;
    layer.firstChild.replaceChildren(frag);
  }

  // 덧씌운 고리를 어두운 칸 모양으로 자르기
  function clipOverlays() {
    const origin = ring.getBoundingClientRect();
    overlays.forEach(({ tile, layer }) => {
      const t = tile.getBoundingClientRect();
      const x1 = t.left - origin.left, y1 = t.top - origin.top;
      const x2 = t.right - origin.left, y2 = t.bottom - origin.top;
      layer.style.clipPath = `polygon(${x1}px ${y1}px, ${x2}px ${y1}px, ${x2}px ${y2}px, ${x1}px ${y2}px)`;
    });
  }

  function build(force) {
    if (force) lastWidth = 0;
    if (buildGlyphs()) [base, ...overlays.map((o) => o.layer)].forEach(fill);
    clipOverlays();
  }

  let timer = null;
  const rebuildSoon = () => {
    clearTimeout(timer);
    timer = setTimeout(() => build(false), 80);
  };
  window.addEventListener("resize", rebuildSoon);
  if (window.ResizeObserver) new ResizeObserver(rebuildSoon).observe(ring);
  window.addEventListener("load", () => build(false));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => build(true));
  build(false);
})();
