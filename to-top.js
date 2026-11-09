// =====================================================
// UP TO TOP 버튼
// - 글(또는 목록)을 절반쯤 내리면 화면 오른쪽 아래에 나타남 (BACK 버튼과 같은 세로선)
// - 사진 글처럼 사진·본문 칸이 따로 스크롤되는 경우도 함께 계산
// - 누르면 맨 위로 부드럽게 이동
// =====================================================
(() => {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "top-button";
  button.textContent = "UP TO TOP";
  button.setAttribute("aria-label", "맨 위로");
  document.body.appendChild(button);

  // 0 = 맨 위, 1 = 맨 아래
  const progress = (el, minRange) => {
    const range = el.scrollHeight - el.clientHeight;
    return range > minRange ? el.scrollTop / range : 0;
  };

  // 따로 스크롤되는 칸 (사진 글의 사진 칸 · 본문 칸)
  const innerScrollers = () =>
    [...document.querySelectorAll(".post-image-gallery, .post-split-layout .post-content")]
      .filter((el) => el.offsetParent && el.scrollHeight > el.clientHeight + 1);

  function update() {
    const page = progress(document.scrollingElement, 200);   // 거의 스크롤이 없는 화면에서는 안 나타나게
    const inner = innerScrollers().map((el) => progress(el, 200));
    button.classList.toggle("is-visible", Math.max(page, ...inner) >= 0.5);
  }

  document.addEventListener("scroll", update, { capture: true, passive: true });
  window.addEventListener("resize", update);
  document.addEventListener("portfolio:view", () => setTimeout(update, 50));

  button.addEventListener("click", () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
    innerScrollers().forEach((el) => el.scrollTo({ top: 0, behavior: "smooth" }));
  });
})();
