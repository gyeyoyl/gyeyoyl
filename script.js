(() => {
  const $ = (selector) => document.querySelector(selector);

  const home = $("#home-view");
  const listing = $("#listing-view");
  const postView = $("#post-view");
  const guestView = $("#guest-view");
  const backButton = $("#back-button");
  const notice = $("#notice");

  // 카테고리 이름: index.html의 data-category와 일치해야 함
  const categoryNames = {
    text: {
      number: "01",
      title: "text",
      description: "A collection of texts."
    },
    magazines: {
      number: "02",
      title: "magazines",
      description: "A collection of editorial works."
    },
    column: {
      number: "03",
      title: "column",
      description: "A collection of thoughts and criticism."
    },
    shoot: {
      number: "04",
      title: "shoot",
      description: "A collection of visual works."
    }
  };

  let posts = [];
  let currentCategory = null;
  let currentPost = null;
  let historyStack = [];
  let currentView = "home";
  let shuffled = false;

  // 알림
  function toast(message) {
    if (!notice) return;

    notice.textContent = message;
    notice.classList.add("show");

    clearTimeout(toast.timer);

    toast.timer = setTimeout(() => {
      notice.classList.remove("show");
    }, 2200);
  }

  // HTML에 그대로 삽입해도 안전하도록 문자 처리
  function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[char]);
  }

// 게시물 제목으로 손글씨 이미지 경로 자동 생성
// (posts.json에 titleImage가 있으면 그 이름의 이미지를 사용)
function getTitleImage(post) {
  const name = post.titleImage || post.title;

  if (!name) return null;

  return `images/titles/${name}.png`;
}
  // 게시물 미리보기 문장 만들기
function excerpt(markdown = "") {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[#>*_`~-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 150);
}

  // 게시물 불러오기
  async function loadPosts() {
    try {
      const response = await fetch("posts.json", {
        cache: "no-store"
      });

      if (!response.ok) {
        throw new Error("error!");
      }

      const data = await response.json();

      posts = await Promise.all(
        data.map(async (item, index) => {
          let body = "";

          try {
            const fileResponse = await fetch(item.file, {
              cache: "no-store"
            });

            if (fileResponse.ok) {
              body = await fileResponse.text();
            }
          } catch (error) {
            console.error("error!");
          }

          return {
            ...item,
            body,
            id: item.id || String(index + 1).padStart(2, "0"),
            excerpt: item.excerpt || excerpt(body)
          };
        })
      );

      posts = posts.filter((post) => post.file && post.title);

      // 게시물 로딩이 끝난 뒤 현재 카테고리 목록 갱신
      if (currentCategory) {
        renderPosts();
      }

      console.log("게시물 불러오기 완료:", posts.length);

    } catch (error) {
      console.error(error);

      posts = [];

      toast("error!");
    }
  }

  // 화면 전환
  function showView(view) {
    home.hidden = view !== "home";
    listing.hidden = view !== "listing";
    postView.hidden = view !== "post";
    guestView.hidden = view !== "guest";

    backButton.hidden = view === "home";
    currentView = view;

    // 현재 화면 이름을 body에 표시 (CSS에서 글 화면일 때 헤더 문구 숨김)
    document.body.dataset.view = view;

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });

    // 방명록(guestbook.js)에 화면이 바뀌었다고 알림 → 방명록을 떠나면 카메라 끄기
    document.dispatchEvent(new CustomEvent("portfolio:view", { detail: view }));
  }

  // 뒤로 가기 기록
  function pushState(state) {
    historyStack.push(state);

    // 브라우저 기록에도 한 칸 추가
    // → 트랙패드 스와이프·브라우저 뒤로 버튼·휴대폰 뒤로 가기가 사이트 안에서 작동
    history.pushState({ portfolio: true, depth: historyStack.length }, "");
  }

  // 뒤로 가기 요청 (BACK 버튼, 키보드, 위로 당기기 제스처)
  // 브라우저 기록을 통해 뒤로 가서, 스와이프와 똑같이 동작하게 함
  function requestBack() {
    if (historyStack.length > 0 && history.state && history.state.portfolio) {
      history.back();
    } else {
      goBack();
    }
  }

  // 브라우저 기록이 바뀌었을 때 (스와이프, 브라우저 뒤로/앞으로 버튼)
  window.addEventListener("popstate", (event) => {
    const depth = event.state && event.state.portfolio
      ? event.state.depth
      : 0;

    if (depth < historyStack.length) {
      // 뒤로 가기: 기록 깊이에 맞을 때까지 한 단계씩 뒤로
      while (historyStack.length > depth) {
        goBack();
      }
    } else if (depth > historyStack.length) {
      // 앞으로 가기는 지원하지 않으므로 원래 위치로 되돌림
      history.go(historyStack.length - depth);
    }
  });

  history.replaceState({ portfolio: true, depth: 0 }, "");

  // 카테고리 열기
  function openCategory(category, save = true) {
    if (!categoryNames[category]) {
      console.error("존재하지 않는 카테고리:", category);
      return;
    }

    if (save) {
      pushState({
        view: currentPost
          ? "post"
          : currentCategory
            ? "listing"
            : "home",
        category: currentCategory,
        postId: currentPost?.id
      });
    }

    currentCategory = category;
    currentPost = null;
    shuffled = false;

    const meta = categoryNames[category];

    $("#listing-number").textContent = meta.number;

    $("#listing-title").innerHTML = `
  <img src="images/${category}.png" alt="${meta.title}">
`;

    $("#listing-description").textContent = meta.description;

    renderPosts();
    showView("listing");
  }

  // 카테고리 안의 게시물 목록 표시
  function renderPosts() {
    const list = $("#post-list");

    let items = posts.filter(
      (post) => post.category === currentCategory
    );

    if (shuffled) {
      items = items.slice().sort(() => Math.random() - 0.5);
    }

    $("#listing-count").textContent =
      `${String(items.length).padStart(2, "0")} ITEMS`;

    if (items.length === 0) {
      list.innerHTML = `
        <p class="empty-state">
          No posts available in this category.
          <br>
          error!
        </p>
      `;
      return;
    }

    // 화살표 등 별도의 장식 요소 없이 제목과 설명만 표시
    list.innerHTML = items.map((post, index) => `
      <button
        class="post-card"
        data-post-id="${escapeHtml(post.id)}"
        type="button"
      >
        <span class="card-no">
          ${String(index + 1).padStart(2, "0")}
        </span>

        <span class="card-info">
          <span class="card-title">
            ${
              getTitleImage(post)
                ? `<img
                    class="handwriting-post-title"
                    src="${getTitleImage(post)}"
                    alt="${escapeHtml(post.title)}"
                    onerror="this.replaceWith(document.createTextNode(this.alt))"
                  >`
                : escapeHtml(post.title)
            }
          </span>

          <span class="card-excerpt">
            ${escapeHtml(post.excerpt || "")}
          </span>
        </span>
      </button>
    `).join("");

    list.querySelectorAll("[data-post-id]").forEach((button) => {
      button.addEventListener("click", () => {
        openPost(button.dataset.postId);
      });
    });
  }

  // 이전 글과 다음 글 찾기
  function getAdjacentPosts() {
    if (!currentPost) {
      return {
        previous: null,
        next: null
      };
    }

    const items = posts.filter(
      (post) => post.category === currentPost.category
    );

    const index = items.findIndex(
      (post) => String(post.id) === String(currentPost.id)
    );

    if (index === -1 || items.length < 2) {
      return {
        previous: null,
        next: null
      };
    }

    return {
      previous: items[(index - 1 + items.length) % items.length],
      next: items[(index + 1) % items.length]
    };
  }

// 손글씨 PNG의 좌우 투명 여백을 화면에서만 잘라내기 (원본 파일은 그대로)
// - 위아래 여백은 그대로 둬서 글씨 크기가 바뀌지 않게 함
// - 가장자리에 떨어져 있는 아주 작은 점(먼지)은 무시함
const trimmedTitleCache = {};

function trimTitleImage(img, src) {
  if (trimmedTitleCache[src]) {
    img.src = trimmedTitleCache[src];
    return;
  }

  const source = new Image();

  source.onload = () => {
    try {
      const width = source.naturalWidth;
      const height = source.naturalHeight;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(source, 0, 0);

      const pixels = context.getImageData(0, 0, width, height).data;

      // 세로줄마다 진한 픽셀 개수 세기
      const columnInk = new Array(width).fill(0);
      let totalInk = 0;

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (pixels[(y * width + x) * 4 + 3] > 100) {
            columnInk[x]++;
          }
        }
      }

      // 글씨가 있는 세로줄을 덩어리로 묶기 (30px 이상 떨어지면 다른 덩어리)
      const groups = [];

      for (let x = 0; x < width; x++) {
        if (columnInk[x] < 3) continue;

        const last = groups[groups.length - 1];

        if (last && x - last.end <= 30) {
          last.end = x;
          last.ink += columnInk[x];
        } else {
          groups.push({ start: x, end: x, ink: columnInk[x] });
        }

        totalInk += columnInk[x];
      }

      // 양 끝의 아주 작은 덩어리(전체의 1% 미만)는 먼지로 보고 제외
      while (groups.length > 1 && groups[0].ink < totalInk * 0.01) {
        groups.shift();
      }

      while (groups.length > 1 && groups[groups.length - 1].ink < totalInk * 0.01) {
        groups.pop();
      }

      if (groups.length === 0) return;

      const left = Math.max(0, groups[0].start - 4);
      const right = Math.min(width - 1, groups[groups.length - 1].end + 4);
      const croppedWidth = right - left + 1;

      const output = document.createElement("canvas");
      output.width = croppedWidth;
      output.height = height;
      output.getContext("2d").drawImage(
        source,
        left, 0, croppedWidth, height,
        0, 0, croppedWidth, height
      );

      trimmedTitleCache[src] = output.toDataURL("image/png");
      img.src = trimmedTitleCache[src];
    } catch (error) {
      // 자르기에 실패하면 원본 이미지를 그대로 보여줌
    }
  };

  source.src = src;
}

// 이전 글 / 다음 글 제목을 손글씨 이미지로 표시
function updatePostNavigation() {
const previousButton = $("#previous-post");
const previousTitle = $("#previous-post-title");
const nextButton = $("#next-post");
const nextTitle = $("#next-post-title");

if (!previousButton || !previousTitle || !nextButton || !nextTitle) {
  return;
}

const { previous, next } = getAdjacentPosts();

function renderTitle(element, post) {
  if (!post) {
    element.replaceChildren();
    return;
  }

  const imagePath = getTitleImage(post);
  const img = document.createElement("img");

  img.src = imagePath;
  img.alt = post.title;
  img.className = "handwriting-post-title";

  img.onerror = () => {
    element.textContent = post.title;
  };

  element.replaceChildren(img);

  // 손글씨 PNG의 좌우 투명 여백 자르기
  trimTitleImage(img, imagePath);
}

renderTitle(previousTitle, previous);
renderTitle(nextTitle, next);

previousButton.disabled = !previous;
nextButton.disabled = !next;

// 이전/다음 글이 없으면 그쪽(PREVIOUS / NEXT 글자 포함)을 숨김
previousButton.style.visibility = previous ? "" : "hidden";
nextButton.style.visibility = next ? "" : "hidden";

}

  // 사진이 있는 게시물은 사진과 본문을 분리해서 표시
function setupPostImageLayout() {
  const postView = document.querySelector("#post-view");
  const postContent = document.querySelector("#post-content");

  if (!postView || !postContent) return;

  let layout = postView.querySelector(".post-split-layout");
  let gallery = postView.querySelector(".post-image-gallery");

  // 이전 글의 좌우 레이아웃이 남아 있다면,
  // 본문 영역을 먼저 밖으로 꺼낸 뒤 레이아웃(이전 글 사진 포함)만 삭제
  if (layout) {
    layout.parentNode.insertBefore(postContent, layout);
    layout.remove();
    layout = null;
    gallery = null;
  }

  postView.classList.remove("is-photo-only");

  const images = Array.from(postContent.querySelectorAll("img"));

  // 사진이 없으면 기존 레이아웃 유지
  if (images.length === 0) {
    postView.classList.remove("has-post-images");
    return;
  }

  // 좌우 레이아웃 생성
  layout = document.createElement("div");
  layout.className = "post-split-layout";

  gallery = document.createElement("div");
  gallery.className = "post-image-gallery";

  layout.appendChild(gallery);

  // 본문 영역을 좌우 레이아웃 안으로 이동
  postContent.parentNode.insertBefore(layout, postContent);
  layout.appendChild(postContent);

  // 본문 속 이미지를 왼쪽 사진 영역으로 이동
  images.forEach((img) => {
    const figure = document.createElement("figure");
    figure.className = "post-gallery-item";

    const captionText =
      img.getAttribute("alt") ||
      img.getAttribute("data-caption") ||
      "";

    const imageParagraph = img.closest("p");

    figure.appendChild(img);

    if (captionText.trim()) {
      const caption = document.createElement("figcaption");
      caption.textContent = captionText;
      figure.appendChild(caption);
    }

    gallery.appendChild(figure);

    // 이미지가 들어 있던 기존 문단 정리
    if (
      imageParagraph &&
      imageParagraph.querySelectorAll("img").length === 0 &&
      !imageParagraph.textContent.trim()
    ) {
      imageParagraph.remove();
    }
  });

  // 사진을 빼낸 자리에 남은 맨 앞 빈 줄바꿈 제거
  // (본문 첫 줄이 사진 맨 윗선과 같은 높이에서 시작하도록)
  const firstBlock = postContent.firstElementChild;

  if (firstBlock) {
    while (
      firstBlock.firstChild &&
      (
        firstBlock.firstChild.nodeName === "BR" ||
        (firstBlock.firstChild.nodeType === Node.TEXT_NODE &&
          !firstBlock.firstChild.textContent.trim())
      )
    ) {
      firstBlock.firstChild.remove();
    }
  }

  postView.classList.add("has-post-images");

  // 글 없이 사진만 있는 글: 사진을 가운데에 크게 한 줄로 (아카이브 배치)
  if (!postContent.textContent.trim()) {
    postView.classList.add("is-photo-only");
  }
}

  // 게시물 열기
  function openPost(id, save = true) {
    const post = posts.find(
      (item) => String(item.id) === String(id)
    );

    if (!post) return;

    // 목록에서 글을 열 때만 뒤로 가기 기록 추가
    // (글에서 이전/다음 글로 넘어갈 때는 추가하지 않아, 뒤로 가면 바로 목록으로)
    if (save && !currentPost) {
      // GUEST 화면에서 출처를 눌러 들어온 경우, 뒤로 가면 GUEST로 돌아감
      pushState(
        currentView === "guest"
          ? { view: "guest" }
          : { view: "listing", category: post.category }
      );
    }

    currentPost = post;
    currentCategory = post.category;

    $("#post-category").textContent =
      (post.category || "archive").toUpperCase();

    $("#post-date").textContent = post.date || "UNDATED";

    // 글 번호(MOVE) 대신 글 제목만 표시
    $("#post-id").textContent = post.title;

    // Markdown 본문 표시
    if (window.marked) {
      $("#post-content").innerHTML = marked.parse(
        post.body || `# ${escapeHtml(post.title)}\n\n본문이 비어 있어.`
      );
    } else {
      $("#post-content").innerHTML = `
        <h1>${escapeHtml(post.title)}</h1>
        <p>${escapeHtml(post.body || "")}</p>
      `;
    }

    setupPostImageLayout();

    // 본문 안의 링크는 새 창으로 열기
    $("#post-content").querySelectorAll("a").forEach((link) => {
      link.target = "_blank";
      link.rel = "noopener noreferrer";
    });

    updatePostNavigation();
    showView("post");
  }

  // 이전 글 또는 다음 글로 이동
  function goToAdjacentPost(direction) {
    if (!currentPost) return;

    const { previous, next } = getAdjacentPosts();

    const target = direction === "previous"
      ? previous
      : next;

    if (target) {
      openPost(target.id);
    }
  }

  // 뒤로 가기
  function goBack() {
    const state = historyStack.pop();

    if (!state) {
      currentCategory = null;
      currentPost = null;
      showView("home");
      return;
    }

    if (state.view === "post" && state.postId) {
      openPost(state.postId, false);
    } else if (state.view === "listing" && state.category) {
      openCategory(state.category, false);
    } else if (state.view === "guest") {
      openGuest(false);
    } else {
      currentCategory = null;
      currentPost = null;
      showView("home");
    }
  }

  // =====================================================
  // GUEST: 방명록 (손동작 바둑판 + 포토부스)
  // 방명록의 실제 기능은 guestbook.js에 있습니다.
  // =====================================================

  // guestbook.js가 쓸 수 있도록 글 목록 · 글 열기 · 알림을 내보냄
  window.portfolio = {
    getPosts: () => posts,
    openPost: (id) => openPost(id),
    toast: (message) => toast(message)
  };

  // GUEST 화면 열기
  function openGuest(save = true) {
    if (save) {
      pushState({ view: "home" });
    }

    currentCategory = null;
    currentPost = null;

    showView("guest");
  }

  $("#guest-button").addEventListener("click", () => openGuest());

  // 카테고리 버튼 연결
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      openCategory(button.dataset.category);
    });
  });

  // 뒤로 가기 버튼
  backButton.addEventListener("click", requestBack);

  // 게시물 순서 섞기
  $("#shuffle-button").addEventListener("click", () => {
    shuffled = !shuffled;

    renderPosts();

    toast(
      shuffled
        ? "Order reshuffled."
        : "Default order restored."
    );
  });

  // 이전 글 / 다음 글 버튼
  const previousButton = $("#previous-post");
  const nextButton = $("#next-post");

  if (previousButton) {
    previousButton.addEventListener("click", () => {
      goToAdjacentPost("previous");
    });
  }

  if (nextButton) {
    nextButton.addEventListener("click", () => {
      goToAdjacentPost("next");
    });
  }

  // 키보드로 뒤로 가기
  document.addEventListener("keydown", (event) => {
    const activeTag = document.activeElement?.tagName;

    // 글 입력칸에서 타이핑 중일 때는 뒤로 가기 하지 않음
    if (["INPUT", "TEXTAREA"].includes(activeTag)) return;

    if (event.key === "Escape" || event.key === "Backspace") {
      if (!backButton.hidden) {
        event.preventDefault();
        requestBack();
      }
    }
  });

  // 트랙패드 제스처
  // - 두 손가락 좌우 스와이프: 브라우저 기본 기능(뒤로 가기)이 처리
  //   (위의 브라우저 기록 연동 덕분에 사이트 안에서 한 단계씩 뒤로 감)
  // - 맨 위에서 위로 당기기: 아래 코드가 처리
  let wheelX = 0;
  let wheelY = 0;
  let wheelTimer = null;
  let gestureLock = false;

  window.addEventListener("wheel", (event) => {
    if (backButton.hidden || gestureLock) return;

    // 사진 글의 사진/본문 영역 안에서 위로 스크롤 중이면 뒤로 가기 하지 않음
    const panel = event.target.closest?.(
      ".post-image-gallery, .post-split-layout .post-content"
    );

    if (
      panel &&
      panel.scrollTop > 0 &&
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
    ) {
      wheelX = 0;
      wheelY = 0;
      return;
    }

    if (
      Math.abs(event.deltaY) > Math.abs(event.deltaX) &&
      window.scrollY <= 2 &&
      event.deltaY < -15
    ) {
      wheelY += event.deltaY;
    } else {
      wheelX = 0;
      wheelY = 0;
      return;
    }

    clearTimeout(wheelTimer);

    wheelTimer = setTimeout(() => {
      if (
        Math.abs(wheelX) > 110 ||
        wheelY < -125
      ) {
        gestureLock = true;

        requestBack();

        setTimeout(() => {
          gestureLock = false;
        }, 550);
      }

      wheelX = 0;
      wheelY = 0;
    }, 120);
  }, { passive: true });

  // 상단 시계
  function updateClock() {
    const clock = $("#live-clock");

    if (!clock) return;

    const date = new Date();

    const time = [
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    ]
      .map((number) => String(number).padStart(2, "0"))
      .join(":");

    clock.textContent = `SEOUL · ${time}`;
  }

  updateClock();
  setInterval(updateClock, 1000);

  // 게시물 불러오기
  loadPosts();
})();
