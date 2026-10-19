(() => {
  const $ = (selector) => document.querySelector(selector);

  const home = $("#home-view");
  const listing = $("#listing-view");
  const postView = $("#post-view");
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

    backButton.hidden = view === "home";

    window.scrollTo({
      top: 0,
      behavior: "instant"
    });
  }

  // 뒤로 가기 기록
  function pushState(state) {
    historyStack.push(state);

    if (historyStack.length > 80) {
      historyStack.shift();
    }
  }

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

    $("#listing-title").textContent = meta.title;

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
            ${escapeHtml(post.title)}
          </span>
<br>
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

  // 이전 글 / 다음 글 제목 표시
  function updatePostNavigation() {
    const previousButton = $("#previous-post");
    const previousTitle = $("#previous-post-title");
    const nextButton = $("#next-post");
    const nextTitle = $("#next-post-title");

    // HTML에 이전/다음 글 영역이 없다면 건너뜀
    if (
      !previousButton ||
      !previousTitle ||
      !nextButton ||
      !nextTitle
    ) {
      return;
    }

    const { previous, next } = getAdjacentPosts();

    previousTitle.textContent = previous
      ? previous.title
      : "Previous post not found";

    nextTitle.textContent = next
      ? next.title
      : "Next post not found";

    previousButton.disabled = !previous;
    nextButton.disabled = !next;
  }

  // 사진이 있는 게시물은 사진과 본문을 분리해서 표시
function setupPostImageLayout() {
  const postView = document.querySelector("#post-view");
  const postContent = document.querySelector("#post-content");

  if (!postView || !postContent) return;

  let layout = postView.querySelector(".post-split-layout");
  let gallery = postView.querySelector(".post-image-gallery");

  // 기존 레이아웃이 있다면 사진을 본문으로 복구
  if (gallery) {
    gallery.querySelectorAll("img").forEach((img) => {
      const paragraph = document.createElement("p");
      paragraph.appendChild(img);
      postContent.appendChild(paragraph);
    });

    layout.remove();
    layout = null;
    gallery = null;
  }

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

  postView.classList.add("has-post-images");
}

  // 게시물 열기
  function openPost(id, save = true) {
    const post = posts.find(
      (item) => String(item.id) === String(id)
    );

    if (!post) return;

    if (save) {
      pushState({
        view: "listing",
        category: post.category
      });
    }

    currentPost = post;
    currentCategory = post.category;

    $("#post-category").textContent =
      (post.category || "archive").toUpperCase();

    $("#post-date").textContent = post.date || "UNDATED";

    $("#post-id").textContent =
      `MOVE ${String(post.id).padStart(2, "0")}`;

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
    } else {
      currentCategory = null;
      currentPost = null;
      showView("home");
    }
  }

  // 카테고리 버튼 연결
  document.querySelectorAll("[data-category]").forEach((button) => {
    button.addEventListener("click", () => {
      openCategory(button.dataset.category);
    });
  });

  // 뒤로 가기 버튼
  backButton.addEventListener("click", goBack);

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

    if (
      event.key === "Escape" ||
      (
        event.key === "Backspace" &&
        !["INPUT", "TEXTAREA"].includes(activeTag)
      )
    ) {
      if (!backButton.hidden) {
        event.preventDefault();
        goBack();
      }
    }
  });

  // 트랙패드 제스처
  let wheelX = 0;
  let wheelY = 0;
  let wheelTimer = null;
  let gestureLock = false;

  window.addEventListener("wheel", (event) => {
    if (backButton.hidden || gestureLock) return;

    if (
      Math.abs(event.deltaX) > Math.abs(event.deltaY) &&
      Math.abs(event.deltaX) > 18
    ) {
      wheelX += event.deltaX;
    } else if (
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

        goBack();

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
