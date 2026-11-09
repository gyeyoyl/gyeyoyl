// =====================================================
// 마우스 커서: 흰 원 + 색 반전(difference) — pisache.kr 커서와 같은 효과
// - 마우스를 따라다니는 24px 원, 아래 색을 반전시켜 보여 줌
// - 링크·버튼 위에서는 1.5배로 커짐
// - 마우스가 창 밖으로 나가면 숨김
// - 화면 폭 993px 이하 · 터치 기기에서는 쓰지 않음 (style.css)
// =====================================================
(() => {
  const cursor = document.createElement("div");
  cursor.className = "cursor";
  cursor.setAttribute("aria-hidden", "true");
  document.body.appendChild(cursor);

  const HOVER_TARGETS = "a, button, input, textarea, select, label, [role='button'], #board";
  let visible = false;

  // 마우스가 움직일 때 커서 위치 업데이트
  window.addEventListener("mousemove", (e) => {
    if (!visible) {
      cursor.style.opacity = "1";
      visible = true;
    }
    cursor.style.left = e.clientX + "px";
    cursor.style.top = e.clientY + "px";
  });

  // 링크·버튼 위에 올라가면 커서 크기 변경 (나중에 생기는 버튼에도 적용되도록 위임 방식)
  document.addEventListener("mouseover", (e) => {
    const onTarget = !!(e.target.closest && e.target.closest(HOVER_TARGETS));
    cursor.classList.toggle("cursor-hover", onTarget);
    cursor.style.opacity = "1";
    visible = true;
  });

  // 마우스가 창 밖으로 나갈 때 커서 숨기기
  window.addEventListener("mouseout", (e) => {
    if (!e.relatedTarget || e.relatedTarget.nodeName === "HTML") {
      cursor.style.opacity = "0";
      visible = false;
    }
  });
})();
