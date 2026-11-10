// =====================================================
// 방명록 (GUEST) — 손동작으로 돌 두기 + 포토부스
// index.html의 #guest-view 안에서만 작동합니다.
// 화면 전환은 script.js가 "portfolio:view" 신호로 알려 줍니다.
// =====================================================

// =====================================================
// DETECTOR START — 착수 동작 A 판별 (화면과 무관한 계산만)
// =====================================================
// 손 모양 읽기 (MediaPipe 손 관절 21개 기준)
//  0 손목 · 검지 5-6-7-8 · 중지 9-10-11-12 · 약지 13-14-15-16 · 새끼 17-18-19-20 (끝 번호가 손가락 끝)
function classifyHand(lm) {
  const d = (a, b) => Math.hypot(lm[a].x - lm[b].x, lm[a].y - lm[b].y);
  const size = d(0, 9) || 1e-6;                       // 손 크기 = 손목~중지 뿌리
  const straight = (tip, pip) => d(0, tip) > d(0, pip) * 1.15;  // 손가락이 펴짐
  const folded = (tip, pip) => d(0, tip) < d(0, pip) * 1.0;     // 손가락 끝이 마디보다 손목 쪽 = 접힘

  const index = straight(8, 6), middle = straight(12, 10), ring = straight(16, 14), pinky = straight(20, 18);
  const ringFolded = folded(16, 14), pinkyFolded = folded(20, 18), middleFolded = folded(12, 10);
  const together = d(8, 12) < 0.35 * size;            // 검지·중지 끝이 바짝 붙음

  return {
    size,
    // 돌 집기: 검지·중지만 펴서 붙이고, 약지·새끼는 접기
    grip: index && middle && together && ringFolded && pinkyFolded,
    // 펜: 검지만 펴고 나머지는 접기
    point: index && middleFolded && ringFolded && pinkyFolded,
    // 지우개: 네 손가락 모두 펴기 (손바닥 펼침)
    open: index && middle && ring && pinky && d(8, 20) > 0.6 * size
  };
}

function createPlaceDetector(options = {}) {
  const settings = {
    dropRatio: 0.10,     // 짧은 시간 안에 내려가야 하는 거리 (화면 높이 비율)
    pushRatio: 1.35,     // 카메라 쪽으로 미는 동작: 손 크기가 이만큼 커지면 인정
    steadyMs: 250,       // 내리기 직전, 이 시간 동안 한 자리에 머물러 있어야 함 (조준)
    steadyRange: 0.04,   // 머무를 때 허용되는 흔들림
    windowMs: 320,       // "짧고 빠르게"의 기준 시간
    aimMs: 400,          // 집은 모양을 이만큼 유지해야 조준 완료
    graceMs: 160,        // 빠르게 움직일 때 집은 모양이 잠깐 끊겨도 봐주는 시간
    cooldownMs: 900,     // 착수 후 쉬는 시간
    ...options
  };

  const history = [];   // { t, x, y, size, grip }
  let gripStart = null;
  let lastGripTime = -Infinity;
  let armed = true;      // 착수 후 손가락을 벌렸다 다시 집어야 다음 착수
  let cooldownUntil = -Infinity;

  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function readHand(lm) {
    const shape = classifyHand(lm);
    const size = shape.size;
    const grip = shape.grip;
    // 화면은 거울처럼 보이므로 x를 뒤집음
    const x = 1 - (lm[8].x + lm[12].x) / 2;
    const y = (lm[8].y + lm[12].y) / 2;
    return { x, y, size, grip };
  }

  // allowPlace가 false면 손 위치·모양만 읽고 착수는 하지 않음 (글이 비어 있을 때)
  function update(landmarks, t, allowPlace = true) {
    if (!landmarks) {
      gripStart = null;
      armed = true;
      history.length = 0;
      return { hand: false, grip: false, aimed: false, place: null };
    }

    const hand = readHand(landmarks);
    history.push({ t, ...hand });
    while (history.length && t - history[0].t > settings.windowMs + settings.steadyMs + 300) history.shift();

    if (hand.grip) {
      lastGripTime = t;
      if (gripStart === null) gripStart = t;
    } else if (t - lastGripTime > settings.graceMs) {
      gripStart = null;
      armed = true; // 손가락을 벌리면 다음 착수 준비
    }

    const gripRecent = t - lastGripTime <= settings.graceMs;
    const aimed = gripStart !== null && t - gripStart >= settings.aimMs;
    let place = null;

    if (allowPlace && gripRecent && aimed && armed && t >= cooldownUntil) {
      // 최근 windowMs 안에서 가장 높이 있던 순간(= 내리기 시작한 자리)
      const recent = history.filter((h) => t - h.t <= settings.windowMs);
      const top = recent.reduce((a, b) => (b.y < a.y ? b : a), recent[0]);
      const drop = hand.y - top.y;
      const push = hand.size / top.size;

      // 내리기 직전에 한 자리에 잠시 머물렀는지 (손을 옮기는 중에 실수로 착수되는 것 방지)
      const before = history.filter((h) => h.t >= top.t - settings.steadyMs && h.t <= top.t);
      const steady = before.length >= 3 &&
        before.every((h) => Math.hypot(h.x - top.x, h.y - top.y) <= settings.steadyRange) &&
        before.filter((h) => h.grip).length >= before.length * 0.8;   // 조준하는 동안 계속 집은 모양

      // 아래로 "톡"은 거의 수직이어야 함 (대각선으로 손을 옮기는 건 착수 아님)
      const sideways = Math.abs(hand.x - top.x);
      const straightDown = sideways <= Math.max(0.03, drop * 0.5);

      // 정확한 동작만: 멈춰서 조준 → 수직으로 톡 내리기 (카메라 쪽으로 밀기는 인정하지 않음)
      // 내리기 시작하기 전에 집은 모양을 충분히(aimMs) 유지했어야 함
      const aimedBeforeDrop = gripStart !== null && top.t - gripStart >= settings.aimMs;

      if (steady && aimedBeforeDrop && drop >= settings.dropRatio && straightDown) {
        place = { x: top.x, y: top.y, drop, push };
        armed = false;
        cooldownUntil = t + settings.cooldownMs;
      }
    }

    return { hand: true, grip: hand.grip, aimed, x: hand.x, y: hand.y, place };
  }

  function setSensitivity(level) {
    // 1(둔감) ~ 10(민감): 내려야 하는 거리 0.16 ~ 0.02 (기본 5 = 0.10)
    settings.dropRatio = 0.18 - level * 0.016;
    settings.pushRatio = 1.5 - level * 0.03;
  }

  return { update, setSensitivity, settings };
}

// 손 위치(화면 비율) → 바둑판 교차점 (화면 가운데 영역을 판 전체에 대응)
function toBoardPoint(x, y) {
  const area = { left: 0.2, right: 0.8, top: 0.15, bottom: 0.75 };
  const nx = (x - area.left) / (area.right - area.left);
  const ny = (y - area.top) / (area.bottom - area.top);
  const clamp = (v) => Math.max(0, Math.min(18, Math.round(v * 18)));
  return { x: clamp(nx), y: clamp(ny) };
}
// DETECTOR END

const $ = (s) => document.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const PAD = 20, GAP = 20, LINES = 19, R = 9.4;

// 바둑판 그리기
const grid = $("#grid");
for (let i = 0; i < LINES; i++) {
  const p = PAD + i * GAP, end = PAD + 18 * GAP;
  [[PAD, p, end, p], [p, PAD, p, end]].forEach(([x1, y1, x2, y2]) => {
    const l = document.createElementNS(NS, "line");
    Object.entries({ x1, y1, x2, y2, stroke: "#14040A", "stroke-width": i === 0 || i === 18 ? 1.6 : 0.6 })
      .forEach(([k, v]) => l.setAttribute(k, v));
    grid.appendChild(l);
  });
}
[3, 9, 15].forEach((a) => [3, 9, 15].forEach((b) => {
  const d = document.createElementNS(NS, "circle");
  d.setAttribute("cx", PAD + a * GAP); d.setAttribute("cy", PAD + b * GAP);
  d.setAttribute("r", 2.6); d.setAttribute("fill", "#14040A");
  grid.appendChild(d);
}));

// ---- 방명록 저장소 (Supabase) ----
// publishable 키는 사이트에 공개되어도 괜찮도록 만들어진 키입니다.
// secret / service_role 키는 절대 여기에 넣지 마세요.
const SUPABASE_URL = "https://cvtjfnrsnmpneenfimrm.supabase.co";
const SUPABASE_KEY = "sb_publishable_EjZW-2u-OnR7fU3UAuhi3A_hSTbJLHf";
const STONES_API = `${SUPABASE_URL}/rest/v1/stones`;
const apiHeaders = (extra = {}) => ({ apikey: SUPABASE_KEY, "Content-Type": "application/json", ...extra });

// 사이트(script.js)와 연결: 글 목록 · 글 열기 · 알림
const site = () => window.portfolio || {};
const siteToast = (text) => (site().toast ? site().toast(text) : console.warn(text));

// 돌 개수 표시 (화면에 #count 칸이 있을 때만)
const setCount = (text) => { const el = $("#count"); if (el) el.textContent = text; };

let stones = [];                     // 판 위의 모든 돌 { x, y, color, message, id, mine }
const myStoneIds = new Set();        // 이번 방문에 내가 둔 돌
let lastTap = { stone: null, time: 0 };
let lastSentenceText = "";

// 저장된 돌 불러오기
async function loadStones() {
  setCount("-- STONES");
  try {
    const res = await fetch(`${STONES_API}?select=id,x,y,color,size,message&order=id.asc`, { headers: apiHeaders(), cache: "no-store" });
    if (!res.ok) throw new Error(`stones ${res.status}`);
    const rows = await res.json();
    const unsaved = stones.filter((st) => st.mine && !st.id);   // 아직 저장 안 된 내 돌은 유지
    stones = rows.map((row) => ({ ...row, mine: myStoneIds.has(row.id) })).concat(unsaved);
  } catch (error) {
    console.error(error);
    siteToast("방명록을 불러오지 못했어요.");
  }
  renderStones();
}

// 돌 저장 (돌을 두는 순간 자동 저장)
async function saveStone(stone) {
  try {
    const res = await fetch(STONES_API, {
      method: "POST",
      headers: apiHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({ x: stone.x, y: stone.y, color: stone.color, size: 1, message: stone.message })
    });
    if (!res.ok) throw new Error(`save ${res.status}`);
    const [row] = await res.json();
    if (row && row.id) { stone.id = row.id; myStoneIds.add(row.id); }
  } catch (error) {
    console.error(error);
    siteToast("저장하지 못했어요. 이 돌은 이번 방문에만 보여요.");
  }
}

// 돌 그리기
function renderStones() {
  const group = $("#stones");
  group.replaceChildren();
  stones.forEach((stone) => {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", PAD + stone.x * GAP); c.setAttribute("cy", PAD + stone.y * GAP);
    c.setAttribute("r", R); c.setAttribute("fill", stone.color === "pink" ? "#EB4587" : "#3a3a3a");
    c.setAttribute("class", stone.mine ? "gb-stone is-new" : "gb-stone");
    c.addEventListener("click", (e) => { e.stopPropagation(); tapStone(stone); });
    group.appendChild(c);
  });
  setCount(`${String(stones.length).padStart(2, "0")} STONES`);
}

// 돌 누르기: 한 번 → 남긴 글 / 두 번(이번에 내가 둔 돌만) → 재생성 문장
function tapStone(stone) {
  const now = Date.now();
  const isDouble = lastTap.stone === stone && now - lastTap.time < 400;
  lastTap = { stone, time: now };
  showNote(stone, isDouble && stone.mine);
}

// 메모 표시
function showNote(stone, regen) {
  const note = $("#note");
  note.classList.remove("is-black", "is-regen");
  note.replaceChildren();
  const add = (cls, text) => { const el = document.createElement("div"); if (cls) el.className = cls; el.textContent = text; note.appendChild(el); return el; };

  if (regen) {
    if (!stone.sentence) stone.sentence = pickSentence();
    note.classList.add("is-regen");
    add("note-label", "재생성 완료");
    if (stone.sentence) {
      add("", stone.sentence.text);
      const src = add("note-source is-link", `「${stone.sentence.title}」 중에서`);
      const postId = stone.sentence.postId;
      src.addEventListener("click", () => { if (site().openPost) site().openPost(postId); });
    } else {
      add("", "문장을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.");
    }
    return;
  }
  note.classList.toggle("is-black", stone.color === "black");
  add("", stone.message);
}

// text 카테고리 글에서 끝맺은 문장만 모아 무작위로 하나
function pickSentence() {
  const posts = site().getPosts ? site().getPosts() : [];
  const pool = [];
  posts.filter((post) => post.category === "text" && post.body).forEach((post) => {
    const plain = post.body.replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/<br\s*\/?>/gi, "\n");
    plain.split("\n").forEach((raw) => {
      const line = raw.trim();
      if (!line || /^\d{4}년/.test(line) || line.startsWith("#") || line.startsWith("(…)")) return;
      line.replace(/([.?!…]+[”’"']?)\s+/g, "$1\n").split("\n").forEach((piece) => {
        const sentence = piece.trim();
        if (!sentence) return;
        const complete = /[.?!…][”’"']?$/.test(sentence) || /(다|요|야|어|지|까|네|아|자|해|녀)$/.test(sentence);
        if (complete) pool.push({ text: sentence, postId: post.id, title: post.title });
      });
    });
  });
  if (pool.length === 0) return null;
  let choice = pool[Math.floor(Math.random() * pool.length)];
  for (let k = 0; k < 5 && pool.length > 1 && choice.text === lastSentenceText; k++) {
    choice = pool[Math.floor(Math.random() * pool.length)];
  }
  lastSentenceText = choice.text;
  return choice;
}

// 돌 두기 (손동작 · 클릭 공용) — 분홍 → 검정 → 분홍 … 번갈아
function placeStone(px, py, how) {
  const msg = $("#message").value.trim();
  if (!msg) {
    $("#status").textContent = "기억을 먼저 써 주세요. 이후 돌을 둘 수 있어요.";
    $("#message").focus();
    return;
  }
  const stone = { x: px, y: py, color: stones.length % 2 === 0 ? "pink" : "black", message: msg.slice(0, 200), mine: true };
  stones.push(stone);
  renderStones();
  showNote(stone, false);
  saveStone(stone);
  $("#message").value = "";
  $("#status").textContent = `기억 위치 (${how}) 가로 ${px + 1}, 세로 ${py + 1} 다음 기억을 쓰면 손 인식이 다시 켜져요.`;
  // 방명록을 남기면 포토부스 버튼 등장
  $("#booth-open").hidden = false;
}

// 캠이 없을 때: 클릭으로 두기
$("#board").addEventListener("click", (e) => {
  const r = e.currentTarget.getBoundingClientRect(), k = 400 / r.width;
  const px = Math.round(((e.clientX - r.left) * k - PAD) / GAP);
  const py = Math.round(((e.clientY - r.top) * k - PAD) / GAP);
  if (px >= 0 && py >= 0 && px < LINES && py < LINES) placeStone(px, py, "클릭");
});

const detector = createPlaceDetector();
// 착수 민감도: 기본 5 (1 둔감 ~ 10 민감)
// 화면에 민감도 막대(#sensitivity)가 있으면 그 값을 쓰고, 없으면 기본값 사용
const DEFAULT_SENSITIVITY = 5;
const sens = $("#sensitivity");
if (sens) {
  const applySens = () => {
    detector.setSensitivity(Number(sens.value));
    const label = $("#sens-value");
    if (label) label.textContent = sens.value;
  };
  sens.addEventListener("input", applySens);
  applySens();
} else {
  detector.setSensitivity(DEFAULT_SENSITIVITY);
}

// 캠 + 손 인식
const MP_VERSION = "0.10.14";
let landmarker = null;
let landmarkerMode = "";
let switchToCpu = null;   // GPU가 실제로 안 될 때 CPU로 바꾸는 함수
let handConnections = null;
let loopGen = 0;          // 카메라를 끄면 숫자가 바뀌어 손 인식 반복이 멈춤
const guestVisible = () => !$("#guest-view").hidden;

// 카메라 끄기 (방명록 화면을 떠날 때)
function stopCamera() {
  loopGen++;
  const video = $("#video");
  const stream = video.srcObject;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  $("#start").classList.remove("is-on");
  const overlay = $("#overlay");
  overlay.getContext("2d").clearRect(0, 0, overlay.width, overlay.height);
  $("#cursor").style.display = "none";
  $(".cam").classList.remove("is-off");
  $("#status").classList.remove("grip");
  $("#status").textContent = "카메라 켜서 시작하기";
  $("#debug").textContent = "";
  $("#start").disabled = false;
}

// 카메라 오류를 이해하기 쉬운 말로
function cameraErrorText(error) {
  const name = error && error.name;
  if (name === "NotAllowedError" || name === "SecurityError")
    return "카메라 사용이 막혀 있어요. ① 주소창 왼쪽 아이콘에서 카메라를 '허용'으로 바꾸고, ② 맥 '시스템 설정 → 개인정보 보호 및 보안 → 카메라'에서 지금 쓰는 브라우저가 켜져 있는지 확인한 뒤 새로고침해 주세요.";
  if (name === "NotFoundError" || name === "OverconstrainedError")
    return "연결된 카메라를 찾지 못했어요.";
  if (name === "NotSupportedError")
    return "지금 연 화면에서는 카메라를 쓸 수 없어요. VS Code 안의 미리보기 창이라면 주소를 복사해서 Chrome이나 Safari에서 직접 열어 주세요.";
  if (name === "NotReadableError" || name === "AbortError")
    return "다른 프로그램(Zoom, FaceTime, Photo Booth 등)이 카메라를 쓰고 있는 것 같아요. 그 프로그램을 닫고 다시 눌러 주세요.";
  return "카메라를 켜지 못했어요.";
}

async function start() {
  const status = $("#status");
  const debug = $("#debug");
  $("#start").disabled = true;

  // 1단계: 이 주소에서 캠을 쓸 수 있는지
  if (location.protocol === "file:" || !window.isSecureContext || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.textContent = location.protocol === "file:"
      ? "파일을 더블클릭해서 연 상태라 캠을 쓸 수 없어요. GitHub 사이트 주소(https)나 VS Code Live Server로 열어 주세요."
      : "이 주소에서는 캠을 쓸 수 없어요. https 주소나 localhost로 열어 주세요.";
    debug.textContent = `주소: ${location.href}`;
    $("#start").disabled = false;
    return;
  }

  // 2단계: 카메라 켜기
  const video = $("#video");
  try {
    status.textContent = "카메라를 켜는 중이에요…";
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" } });
    } catch (first) {
      if (first && (first.name === "OverconstrainedError" || first.name === "NotFoundError")) {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } else {
        throw first;
      }
    }
    if (!guestVisible()) { stream.getTracks().forEach((t) => t.stop()); $("#start").disabled = false; return; }
    video.srcObject = stream;
    $("#start").classList.add("is-on");   // 카메라가 켜지면 버튼 깜빡임 멈춤
    await video.play();
  } catch (error) {
    console.error(error);
    status.textContent = cameraErrorText(error);
    debug.textContent = `카메라 오류: ${error && error.name} · ${error && error.message}`;
    $("#start").disabled = false;
    return;
  }

  // 이미 손 인식 프로그램을 불러온 적이 있으면 그대로 다시 사용
  if (landmarker && handConnections) {
    status.textContent = "손을 카메라에 보여 주세요.";
    loop(video, handConnections);
    return;
  }

  // 3단계 전: 손 인식에 필요한 그래픽 기능(WebGL)이 켜져 있는지 확인
  const glCheck = document.createElement("canvas");
  const hasWebGL2 = !!glCheck.getContext("webgl2");
  const hasWebGL = hasWebGL2 || !!document.createElement("canvas").getContext("webgl");
  if (!hasWebGL2) {
    status.textContent = /Chrome/.test(navigator.userAgent) && !/Edg/.test(navigator.userAgent)
      ? "이 브라우저에서 그래픽 기능(WebGL)이 꺼져 있어서 손 인식을 할 수 없어요. Chrome 설정 → 시스템 → '가능한 경우 그래픽 가속 사용'을 켜고 Chrome을 완전히 껐다 켜 주세요. 또는 Safari로 열어 보세요."
      : "이 브라우저에서 그래픽 기능(WebGL)을 쓸 수 없어서 손 인식을 할 수 없어요. 다른 브라우저(Chrome 또는 Safari)로 열어 보세요.";
    debug.textContent = `WebGL2: 없음 · WebGL: ${hasWebGL ? "있음" : "없음"}`;
    $("#start").disabled = false;
    return;
  }

  // 3단계: 손 인식 프로그램 불러오기 (실패해도 카메라 화면은 유지)
  try {
    status.textContent = "손 인식 프로그램을 불러오는 중이에요… (처음 한 번 몇 초 걸려요)";
    const { FilesetResolver, HandLandmarker } =
      await import(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/vision_bundle.mjs`);
    const fileset = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`);
    const modelPath = "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";
    // 그래픽 가속(GPU)으로 먼저 시도하고, 안 되면 CPU로
    const handOptions = (delegate) => ({
      baseOptions: { modelAssetPath: modelPath, delegate },
      runningMode: "VIDEO",
      numHands: 1,
      minHandDetectionConfidence: 0.3,
      minHandPresenceConfidence: 0.3,
      minTrackingConfidence: 0.3
    });
    try {
      landmarker = await HandLandmarker.createFromOptions(fileset, handOptions("GPU"));
      landmarkerMode = "GPU";
    } catch (gpuError) {
      console.warn(gpuError);
      landmarker = await HandLandmarker.createFromOptions(fileset, handOptions("CPU"));
      landmarkerMode = "CPU";
    }

    switchToCpu = async () => {
      try { landmarker.close(); } catch (e) {}
      landmarker = await HandLandmarker.createFromOptions(fileset, handOptions("CPU"));
      landmarkerMode = "CPU";
    };

    handConnections = HandLandmarker.HAND_CONNECTIONS;
    if (!video.srcObject) return;     // 불러오는 사이 방명록을 떠났으면 시작하지 않음
    status.textContent = "손을 카메라에 보여 주세요.";
    loop(video, handConnections);
  } catch (error) {
    console.error(error);
    status.textContent = "카메라는 켜졌지만 손 인식 프로그램을 불러오지 못했어요. 인터넷 연결이나 광고 차단 프로그램을 확인해 주세요.";
    debug.textContent = `손 인식 오류: ${error && error.name} · ${error && error.message}`;
    $("#start").disabled = false;
  }
}

// 공용 손 인식: 바둑판과 포토부스가 같은 인식기를 번갈아 씀
// - 카메라 화면을 가로 320px로 줄여서 인식 (처리량 감소, 비율은 원본 그대로)
// - 인식 시간값은 두 곳을 합쳐 항상 커지도록
const detectCanvas = document.createElement("canvas");
const detectCtx = detectCanvas.getContext("2d", { willReadFrequently: true });
let sharedStamp = 0;
function detectHand(video) {
  const vw = video.videoWidth || 640, vh = video.videoHeight || 480;
  const w = 320, h = Math.round(320 * vh / vw);
  if (detectCanvas.width !== w || detectCanvas.height !== h) {
    detectCanvas.width = w;
    detectCanvas.height = h;
  }
  detectCtx.drawImage(video, 0, 0, w, h);
  sharedStamp = Math.max(performance.now(), sharedStamp + 1);
  const result = landmarker.detectForVideo(detectCanvas, sharedStamp);
  return { lm: result && result.landmarks && result.landmarks[0], stamp: sharedStamp };
}

// 손 뼈대 직접 그리기 (라이브러리 그리기 도구 대신)
function drawHand(ctx, lm, connections, w, h) {
  ctx.strokeStyle = "#EB4587";
  ctx.lineWidth = 3;
  (connections || []).forEach((c) => {
    const a = lm[c.start !== undefined ? c.start : c[0]];
    const b = lm[c.end !== undefined ? c.end : c[1]];
    if (!a || !b) return;
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  });
  ctx.fillStyle = "#14040A";
  lm.forEach((p) => {
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 3, 0, Math.PI * 2);
    ctx.fill();
  });
}

function loop(video, connections) {
  const canvas = $("#overlay"), ctx = canvas.getContext("2d");
  const cursor = $("#cursor"), ring = $("#cursor-ring"), fill = $("#cursor-fill");

  const INTERVAL = 66; // 약 1초에 15번
  let frames = 0, handFrames = 0, lastError = "", lastCost = 0;
  let errorStreak = 0, switching = false;
  let recognitionOn = false;
  const myGen = ++loopGen;

  function tick() {
    if (myGen !== loopGen) return;   // 카메라를 껐으면 멈춤
    const began = performance.now();
    try {
      // 포토부스가 열려 있으면 바둑판 손 인식은 쉼
      const hasMessage = $("#message").value.trim().length > 0 && !boothOpen;
      $(".cam").classList.toggle("is-off", !hasMessage);

      if (!hasMessage) {
        // 손 인식 꺼짐: 인식하지 않고, 커서·손 뼈대도 숨김
        if (recognitionOn) {
          recognitionOn = false;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          cursor.style.display = "none";
          $("#status").classList.remove("grip");
          detector.update(null, performance.now());
        }
        if (!/기억 위치/.test($("#status").textContent)) {
          $("#status").textContent = "글을 쓰면 손 인식이 켜져요.";
        }
        $("#debug").textContent = `손 인식 꺼짐 (${landmarkerMode}) · 글을 쓰면 켜져요`;
      } else if (video.readyState >= 2) {
        if (!recognitionOn) {
          recognitionOn = true;
          $("#status").textContent = "손을 카메라에 보여 주세요.";
        }
        frames++;
        const { lm, stamp } = detectHand(video);
        if (lm) handFrames++;

        if (canvas.width !== video.videoWidth) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (lm) drawHand(ctx, lm, connections, canvas.width, canvas.height);
        errorStreak = 0;

        const s = detector.update(lm || null, stamp, true);

        if (!s.hand) {
          cursor.style.display = "none";
          $("#status").classList.remove("grip");
          if (!/기억 위치/.test($("#status").textContent)) $("#status").textContent = "손을 카메라에 보여 주세요.";
        } else {
          const p = toBoardPoint(s.x, s.y);
          cursor.style.display = "";
          cursor.setAttribute("transform", `translate(${PAD + p.x * GAP} ${PAD + p.y * GAP})`);
          fill.setAttribute("opacity", s.aimed ? 0.75 : s.grip ? 0.35 : 0);
          fill.setAttribute("fill", stones.length % 2 === 0 ? "#EB4587" : "#3a3a3a");
          ring.setAttribute("stroke", s.grip ? "#EB4587" : "#14040A");
          $("#status").classList.toggle("grip", s.grip);

          if (s.place) {
            const at = toBoardPoint(s.place.x, s.place.y);
            placeStone(at.x, at.y, "손동작");
          } else if (!/기억 위치/.test($("#status").textContent) || !s.grip) {
            $("#status").textContent = s.aimed ? "조준 완료 · 멈췄다가 톡 내리세요" : s.grip ? "기억을 집었습니다" : "검지와 중지를 붙여 돌을 집어 보세요";
          }
        }

        $("#debug").textContent =
          `인식 동작 중 (${landmarkerMode}) · 1회 ${Math.round(lastCost)}ms · 처리 ${frames}장 · 손 보임 ${handFrames}장\n` +
          (s.hand
            ? `집은 모양: ${s.grip ? "예" : "아니오"} · 조준: ${s.aimed ? "예" : "아니오"} · 손 위치: ${s.x.toFixed(2)}, ${s.y.toFixed(2)}`
            : "손 없음") +
          (lastError ? `\n최근 오류: ${lastError}` : "");
      }
    } catch (error) {
      lastError = `${error && error.name} · ${error && error.message}`;
      console.error(error);
      errorStreak++;

      // GPU 방식이 이 컴퓨터에서 계속 실패하면 CPU 방식으로 자동 전환
      if (landmarkerMode === "GPU" && errorStreak >= 3 && !switching && switchToCpu) {
        switching = true;
        $("#status").textContent = "그래픽 가속이 안 돼서 다른 방식으로 바꾸는 중이에요…";
        switchToCpu()
          .then(() => { errorStreak = 0; lastError = ""; })
          .catch((e) => { lastError = `CPU 전환 실패: ${e && e.message}`; })
          .finally(() => { switching = false; setTimeout(tick, 0); });
        return;
      }

      $("#debug").textContent = `인식 중 오류 (${landmarkerMode}): ${lastError}`;
      $("#status").textContent = "손 인식 중 오류가 나고 있어요. 아래 회색 글씨를 알려주세요.";
    }

    lastCost = performance.now() - began;
    // 처리 시간이 길어도 화면이 숨 쉴 틈(최소 20ms)을 두고 다음 인식
    setTimeout(tick, Math.max(20, INTERVAL - lastCost));
  }

  setTimeout(tick, 0);
}

// =====================================================
// 포토부스: 네 컷 촬영 → 손동작으로 꾸미기 → 저장
// =====================================================
const CELL_LONG = 640, CELL_GAP = 12;     // 한 컷의 긴 변 640px (비율은 카메라 원본 그대로), 컷 사이 간격
let STRIP_W = 846, STRIP_H = 1476;        // 완성 사진 전체 크기 (그리드를 고르면 다시 계산)
let rawCells = [];                         // 필터 없이 찍은 원본 컷 4장
let photoFilter = "color";                 // color | bw | sepia
let photoGrid = "h";                       // h = 가로(2×2) | v = 세로(1×4)
const inkStore = {};                       // 그리드마다 펜 자국 따로 보관
const PEN_WIDTH = 7, ERASER_RADIUS = 70;

let boothOpen = false;
let boothMode = "idle";            // idle | shooting | decorate
let penColor = "#14040A";
let mouseTool = "pen";             // pen | eraser (마우스용)

const photoCanvas = $("#booth-photo"), inkCanvas = $("#booth-ink"), pointerCanvas = $("#booth-cursor");
[photoCanvas, inkCanvas, pointerCanvas].forEach((c) => { c.width = STRIP_W; c.height = STRIP_H; });
const photoCtx = photoCanvas.getContext("2d");
const inkCtx = inkCanvas.getContext("2d");
const pointerCtx = pointerCanvas.getContext("2d");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const boothStatus = (text) => { $("#booth-status").textContent = text; };

// 사진 톤: tone = "sepia"(따뜻한 갈색) | "bw"(흑백) — 대비 · 바랜 검정 · 가장자리 어둡게 · 필름 입자
function applyFilmTone(ctx, w, h, tone) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const cx = w / 2, cy = h / 2, maxR = Math.hypot(cx, cy);
  for (let i = 0; i < d.length; i += 4) {
    const p = i / 4, x = p % w, y = (p / w) | 0;
    let l = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) / 255;
    const s = l < 0.5 ? 2 * l * l : 1 - 2 * (1 - l) * (1 - l);   // S자 대비
    l = 0.6 * s + 0.4 * l;
    l = 0.06 + l * 0.88;                                          // 바랜 느낌 (검정이 살짝 뜸)
    const r = Math.hypot(x - cx, y - cy) / maxR;
    l *= 1 - 0.38 * r * r;                                        // 비네팅
    l += (Math.random() - 0.5) * 0.07;                            // 필름 입자
    const v = Math.max(0, Math.min(1, l)) * 255;
    if (tone === "sepia") {
      d[i] = Math.min(255, v * 1.07 + 8);                         // 따뜻한 갈색 톤
      d[i + 1] = Math.min(255, v * 0.97 + 3);
      d[i + 2] = Math.min(255, v * 0.82);
    } else {
      d[i] = d[i + 1] = d[i + 2] = v;                             // 흑백
    }
  }
  ctx.putImageData(img, 0, 0);
}

// 한 컷 찍기: 카메라 원본 비율 그대로, 필터 없이, 거울처럼 뒤집어 보관
function captureCell() {
  const video = $("#video");
  const vw = video.videoWidth || 1280, vh = video.videoHeight || 720;
  const w = vw >= vh ? CELL_LONG : Math.round(CELL_LONG * vw / vh);
  const h = vw >= vh ? Math.round(CELL_LONG * vh / vw) : CELL_LONG;
  const cell = document.createElement("canvas");
  cell.width = w; cell.height = h;
  const c = cell.getContext("2d");
  c.translate(w, 0); c.scale(-1, 1);
  c.drawImage(video, 0, 0, w, h);
  rawCells.push(cell);
}

// 고른 필터·그리드로 네 컷을 한 장에 다시 합치기
function composePhoto() {
  if (rawCells.length < 4) return;
  const cw = rawCells[0].width, ch = rawCells[0].height;
  const cols = photoGrid === "h" ? 2 : 1, rows = photoGrid === "h" ? 2 : 4;
  const newW = cols * cw + (cols + 1) * CELL_GAP;
  const newH = rows * ch + (rows + 1) * CELL_GAP;

  if (newW !== STRIP_W || newH !== STRIP_H) {
    [photoCanvas, inkCanvas, pointerCanvas].forEach((c) => { c.width = newW; c.height = newH; });
    STRIP_W = newW; STRIP_H = newH;
  }
  photoCtx.fillStyle = photoGrid === "h" ? "#17110d" : "#ffffff";   // 가로: 어두운 테두리 · 세로: 흰 테두리
  photoCtx.fillRect(0, 0, STRIP_W, STRIP_H);

  rawCells.forEach((raw, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = CELL_GAP + col * (cw + CELL_GAP), y = CELL_GAP + row * (ch + CELL_GAP);
    if (photoFilter === "color") {
      photoCtx.drawImage(raw, x, y);
    } else {
      const t = document.createElement("canvas");
      t.width = cw; t.height = ch;
      const tc = t.getContext("2d", { willReadFrequently: true });
      tc.drawImage(raw, 0, 0);
      applyFilmTone(tc, cw, ch, photoFilter);
      photoCtx.drawImage(t, x, y);
    }
  });
  fitBooth();
}

// 화면에 보이는 크기 맞추기 (원본 비율 유지, 화면 높이를 넘지 않게)
function fitBox(el, ratio) {
  const stage = el.parentElement;
  const availW = stage.clientWidth || 600;
  const maxH = Math.min(window.innerHeight * (window.innerWidth <= 760 ? 0.56 : 0.64), 620);
  let w = Math.min(availW, maxH * ratio);
  el.style.width = `${Math.round(w)}px`;
  el.style.height = `${Math.round(w / ratio)}px`;
}
function fitBooth() {
  if (!boothOpen) return;
  const video = $("#video");
  const vr = (video.videoWidth && video.videoHeight) ? video.videoWidth / video.videoHeight : 16 / 9;
  if (!$("#booth-live").hidden) fitBox($("#booth-live"), vr);
  if (!$("#booth-result").hidden) fitBox($("#booth-result"), STRIP_W / STRIP_H);
}
window.addEventListener("resize", fitBooth);

// 오늘 날짜 YYYY.MM.DD
function todayText() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}.${two(now.getMonth() + 1)}.${two(now.getDate())}`;
}

// 필터 고르기
document.querySelectorAll(".swatch").forEach((b) => b.addEventListener("click", () => {
  if (boothMode !== "decorate") return;
  photoFilter = b.dataset.filter;
  document.querySelectorAll(".swatch").forEach((o) => o.classList.toggle("is-on", o === b));
  composePhoto();
  prepareShareFile();
}));

// 그리드 고르기 (펜 자국은 그리드마다 따로 남아 있음)
document.querySelectorAll(".grid-btn").forEach((b) => b.addEventListener("click", () => {
  if (boothMode !== "decorate" || b.dataset.grid === photoGrid) return;
  const keep = document.createElement("canvas");
  keep.width = STRIP_W; keep.height = STRIP_H;
  keep.getContext("2d").drawImage(inkCanvas, 0, 0);
  inkStore[photoGrid] = keep;
  photoGrid = b.dataset.grid;
  document.querySelectorAll(".grid-btn").forEach((o) => o.classList.toggle("is-on", o === b));
  composePhoto();
  inkCtx.clearRect(0, 0, STRIP_W, STRIP_H);
  const saved = inkStore[photoGrid];
  if (saved && saved.width === STRIP_W && saved.height === STRIP_H) inkCtx.drawImage(saved, 0, 0);
  drawPointer(null);
  prepareShareFile();
}));

async function shootFour() {
  if (boothMode === "shooting") return;   // 촬영 중 중복 실행 방지
  boothMode = "shooting";
  $("#booth-result").hidden = true;
  $("#booth-live").hidden = false;
  $("#booth-tools").hidden = true;
  $("#booth-shoot").hidden = false;
  $("#booth-shoot").disabled = true;
  $("#booth").classList.add("is-live");
  fitBooth();

  rawCells = [];
  inkCtx.clearRect(0, 0, STRIP_W, STRIP_H);
  delete inkStore.h; delete inkStore.v;

  for (let i = 0; i < 4; i++) {
    if (!boothOpen) return;
    $("#booth-shot").textContent = `${i + 1} / 4`;
    boothStatus(`${i + 1}번째 컷`);
    for (let n = 3; n >= 1; n--) {
      $("#booth-count").textContent = n;
      await sleep(1000);
      if (!boothOpen) return;
    }
    $("#booth-count").textContent = "";
    captureCell();
    const flash = $("#booth-flash");
    flash.classList.add("on");
    await sleep(60);
    flash.classList.remove("on");
    await sleep(700);
  }

  $("#booth-shot").textContent = "";
  $("#booth-live").hidden = true;
  $("#booth-result").hidden = false;
  $("#booth-tools").hidden = false;
  $("#booth-shoot").disabled = false;
  $("#booth-shoot").hidden = true;              // 완성 화면에서는 셔터 대신 retake 버튼 사용
  $("#booth").classList.remove("is-live");
  boothMode = "decorate";
  // 새로 찍을 때마다 원본 · 가로 그리드로 시작
  photoFilter = "color"; photoGrid = "h";
  document.querySelectorAll(".swatch").forEach((o) => o.classList.toggle("is-on", o.dataset.filter === "color"));
  document.querySelectorAll(".grid-btn").forEach((o) => o.classList.toggle("is-on", o.dataset.grid === "h"));
  composePhoto();
  boothStatus(todayText());
  prepareShareFile();
}

// ---- 그리기 / 지우기 (손·마우스 공용) ----
function inkLine(from, to, tool, color) {
  inkCtx.save();
  inkCtx.lineCap = "round";
  inkCtx.lineJoin = "round";
  if (tool === "eraser") {
    inkCtx.globalCompositeOperation = "destination-out";
    inkCtx.lineWidth = ERASER_RADIUS * 2;
    inkCtx.strokeStyle = "#000";
  } else {
    inkCtx.lineWidth = PEN_WIDTH;
    inkCtx.strokeStyle = color;
  }
  inkCtx.beginPath();
  inkCtx.moveTo(from.x, from.y);
  inkCtx.lineTo(to.x + 0.01, to.y);
  inkCtx.stroke();
  inkCtx.restore();
}

function drawPointer(pos, tool) {
  pointerCtx.clearRect(0, 0, STRIP_W, STRIP_H);
  if (!pos) return;
  pointerCtx.save();
  if (tool === "eraser") {
    pointerCtx.setLineDash([10, 8]);
    pointerCtx.strokeStyle = "#f5f5f5";
    pointerCtx.lineWidth = 3;
    pointerCtx.beginPath();
    pointerCtx.arc(pos.x, pos.y, ERASER_RADIUS, 0, Math.PI * 2);
    pointerCtx.stroke();
  } else if (tool === "pen") {
    pointerCtx.fillStyle = penColor;
    pointerCtx.strokeStyle = "#f5f5f5";
    pointerCtx.lineWidth = 2;
    pointerCtx.beginPath();
    pointerCtx.arc(pos.x, pos.y, 9, 0, Math.PI * 2);
    pointerCtx.fill();
    pointerCtx.stroke();
  } else {
    pointerCtx.strokeStyle = "#f5f5f5";
    pointerCtx.lineWidth = 2;
    pointerCtx.beginPath();
    pointerCtx.arc(pos.x, pos.y, 12, 0, Math.PI * 2);
    pointerCtx.stroke();
  }
  pointerCtx.restore();
}

// 마우스·터치로 그리기
let mouseDown = false, mouseLast = null;
function toStrip(event) {
  const r = pointerCanvas.getBoundingClientRect();
  return { x: (event.clientX - r.left) * STRIP_W / r.width, y: (event.clientY - r.top) * STRIP_H / r.height };
}
pointerCanvas.addEventListener("pointerdown", (e) => {
  if (boothMode !== "decorate") return;
  mouseDown = true;
  pointerCanvas.setPointerCapture(e.pointerId);
  mouseLast = toStrip(e);
  inkLine(mouseLast, mouseLast, mouseTool, penColor);
});
pointerCanvas.addEventListener("pointermove", (e) => {
  if (boothMode !== "decorate") return;
  const p = toStrip(e);
  drawPointer(p, mouseTool);                 // 펜/지우개 위치 미리 보기
  if (!mouseDown) return;
  inkLine(mouseLast, p, mouseTool, penColor);
  mouseLast = p;
});
pointerCanvas.addEventListener("pointerleave", () => { if (!mouseDown) drawPointer(null); });
["pointerup", "pointercancel"].forEach((n) => pointerCanvas.addEventListener(n, () => {
  if (mouseDown) prepareShareFile();         // 그린 내용이 바뀌면 공유용 사진 다시 준비
  mouseDown = false;
  mouseLast = null;
}));

// 펜 색 / 마우스 지우개 고르기
document.querySelectorAll(".pen").forEach((pen) => {
  const choose = () => {
    document.querySelectorAll(".pen").forEach((o) => o.classList.toggle("is-on", o === pen));
    if (pen.dataset.pen === "eraser") {
      mouseTool = "eraser";
    } else {
      mouseTool = "pen";
      penColor = pen.dataset.pen;
    }
  };
  pen.addEventListener("click", choose);
  pen.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(); } });
});

// 사진 + 펜 자국을 한 장의 PNG 파일로
let shareFile = null;
let shareVersion = 0;
function photoFileName() {
  const now = new Date();
  const two = (n) => String(n).padStart(2, "0");
  return `gyeyoyl-photobooth-${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}-${two(now.getHours())}${two(now.getMinutes())}.png`;
}
function makePhotoBlob() {
  return new Promise((resolve) => {
    const out = document.createElement("canvas");
    out.width = STRIP_W; out.height = STRIP_H;
    const o = out.getContext("2d");
    o.drawImage(photoCanvas, 0, 0);
    o.drawImage(inkCanvas, 0, 0);
    out.toBlob(resolve, "image/png");
  });
}
// 공유 창은 버튼을 누른 "그 순간"에 열어야 해서(Safari 규칙), 사진 파일을 미리 만들어 둠
async function prepareShareFile() {
  const version = ++shareVersion;
  shareFile = null;
  const blob = await makePhotoBlob();
  if (version === shareVersion && blob) {
    shareFile = new File([blob], photoFileName(), { type: "image/png" });
  }
}

// 공유하기 (Mac Safari: AirDrop · 메시지 · 메일 등이 있는 공유 창)
$("#booth-share").addEventListener("click", () => {
  if (!shareFile) {
    boothStatus("사진을 준비하는 중이에요. 잠시 뒤 다시 눌러 주세요.");
    prepareShareFile();
    return;
  }
  const data = { files: [shareFile], title: "gyeyoyl photo booth" };
  if (!navigator.share || !navigator.canShare || !navigator.canShare(data)) {
    boothStatus("이 브라우저에서는 공유하기를 쓸 수 없어요. 맥의 Safari에서 열면 AirDrop으로 보낼 수 있어요.");
    return;
  }
  navigator.share(data)
    .then(() => boothStatus("공유했어요!"))
    .catch((error) => {
      if (error && error.name === "AbortError") boothStatus("공유를 취소했어요.");
      else boothStatus(`공유하지 못했어요. (${error && error.name})`);
    });
});

// 사진 저장 (이 컴퓨터의 다운로드 폴더)
$("#booth-save").addEventListener("click", async () => {
  const blob = await makePhotoBlob();
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = photoFileName();
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  boothStatus("사진을 저장했어요. 다운로드 폴더를 확인해 주세요.");
});

$("#booth-clear").addEventListener("click", () => { inkCtx.clearRect(0, 0, STRIP_W, STRIP_H); prepareShareFile(); });
$("#booth-retake").addEventListener("click", () => shootFour());
$("#booth-shoot").addEventListener("click", () => shootFour());

// 열기 / 닫기
async function openBooth() {
  if (!$("#video").srcObject) {
    await start();                     // 캠이 꺼져 있으면 먼저 켜기
  }
  const stream = $("#video").srcObject;
  $("#booth").hidden = false;
  boothOpen = true;
  boothMode = "idle";
  $("#booth-live").hidden = false;
  $("#booth-result").hidden = true;
  $("#booth-tools").hidden = true;
  $("#booth-shoot").hidden = false;
  $("#booth-shoot").disabled = !stream;
  $("#booth").classList.add("is-live");
  $("#booth-count").textContent = "";
  $("#booth-shot").textContent = "";
  if (stream) {
    const bv = $("#booth-video");
    bv.srcObject = stream;
    bv.play().catch(() => {});
    boothStatus("네 컷으로 오늘을 기록합니다.");
    fitBooth();
    if (!$("#video").videoWidth) $("#video").addEventListener("loadedmetadata", fitBooth, { once: true });
  } else {
    boothStatus("카메라가 켜져 있지 않아요. 바깥의 'camera' 버튼으로 카메라를 먼저 켜 주세요.");
  }
}

function closeBooth() {
  boothOpen = false;
  boothMode = "idle";
  $("#booth").hidden = true;
  drawPointer(null);
}

$("#booth-open").addEventListener("click", openBooth);
$("#booth-close").addEventListener("click", closeBooth);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && boothOpen) closeBooth(); });

$("#start").addEventListener("click", start);

// 사이트 화면 전환 (script.js의 showView가 알려 줌)
// 방명록을 열면 돌을 불러오고, 떠나면 포토부스를 닫고 카메라를 끔
document.addEventListener("portfolio:view", (event) => {
  if (event.detail === "guest") {
    loadStones();
  } else {
    if (boothOpen) closeBooth();
    if ($("#video").srcObject || $("#start").disabled) stopCamera();
  }
});
if (guestVisible()) loadStones();
