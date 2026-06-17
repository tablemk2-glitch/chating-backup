/* =====================
   BAND 채팅 백업기 v2.2
   ===================== */

/* =====================
   상수 & 상태
   ===================== */

// 기본 프로필: PNG 파일 의존 없이 SVG를 base64로 내장
const DEFAULT_PROFILE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjOWNkZDYiLz4KICA8Y2lyY2xlIGN4PSIyMCIgY3k9IjE2IiByPSI3IiBmaWxsPSIjZmZmIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzYiIHJ4PSIxMiIgcnk9IjkiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==";

// ✅ profileImages 최상단 선언 (ReferenceError 방지)
let profileImages = {};
try {
  const raw = JSON.parse(localStorage.getItem("profileImages") || "{}");
  // 저장된 키를 정규화하여 재구성
  for (const [key, val] of Object.entries(raw)) {
    profileImages[normName(key)] = val;
  }
} catch {
  profileImages = {};
}

let chatData = [];

/* =====================
   이름 정규화 유틸
   어디서든 동일한 규칙으로 이름 키를 만들도록 한 곳에서 관리
   ===================== */
function normName(str) {
  return String(str).trim().replace(/\s+/g, " ");
}

/* =====================
   DOM 참조
   ===================== */
const txtFile        = document.getElementById("txtFile");
const searchInput    = document.getElementById("searchInput");
const searchClear    = document.getElementById("searchClear");
const downloadBtn    = document.getElementById("downloadBtn");
const characterList  = document.getElementById("characterList");
const characterCount = document.getElementById("characterCount");
const chatContainer  = document.getElementById("chatContainer");
const statsBox       = document.getElementById("statsBox");
const toast          = document.getElementById("toast");

/* =====================
   이벤트 등록
   ===================== */
txtFile.addEventListener("change", handleTxtUpload);

searchInput.addEventListener("input", e => {
  const kw = e.target.value.trim();
  searchClear.classList.toggle("visible", kw.length > 0);
  renderChat(kw);
});

searchClear.addEventListener("click", () => {
  searchInput.value = "";
  searchClear.classList.remove("visible");
  renderChat();
});

downloadBtn.addEventListener("click", exportHTML);
downloadBtn.disabled = true;

/* =====================
   TXT 업로드
   ===================== */
function handleTxtUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  if (!file.name.toLowerCase().endsWith(".txt")) {
    showToast("❌ .txt 파일만 업로드할 수 있습니다.");
    return;
  }

  const reader = new FileReader();
  reader.onload  = () => {
    parseChat(reader.result);
    showToast("✅ 파일을 불러왔습니다.");
  };
  reader.onerror = () => showToast("❌ 파일 읽기 실패");
  reader.readAsText(file, "utf-8");
}

/* =====================
   채팅 파싱
   ===================== */
function parseChat(text) {
  chatData = [];
  const characters = new Set();

  // BOM 제거
  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const timestampPrefix = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+/;

  // ── 안드로이드 정규식 ──────────────────────────────────
  const regexAndroidMain  = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)[,\s]\s*(.+?)\s*:(.*)/;
  const regexAndroidColon = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+):([^:]+):(.*)/;

  // ── 포맷 자동 판별 ─────────────────────────────────────
  const isAndroid = lines.some(
    l => regexAndroidMain.test(l) || regexAndroidColon.test(l)
  );

  // ── 아이폰 포맷 전처리: 이름 후보 빈도 계산 ───────────
  // ✅ [태그]가 항상 존재 → [태그] 이후 rest에서만 이름 후보 수집
  // ✅ rest가 비어있는 줄은 시스템 메시지이므로 후보 수집 제외
  let knownNames = null;

  if (!isAndroid) {
    const regexIOSRest = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+\s\[[^\]]+\]\s(.+)/;
    const freq = {};

    lines.forEach(line => {
      const m = line.match(regexIOSRest);
      if (!m) return;
      const words = m[1].trim().split(/\s+/);
      // 메시지가 최소 1단어 남도록 이름 후보 길이 제한
      for (let len = 1; len <= Math.min(3, words.length - 1); len++) {
        const candidate = words.slice(0, len).join(" ");
        freq[candidate] = (freq[candidate] || 0) + 1;
      }
    });

    // 2회 이상 등장한 후보만 이름으로 확정 (1회성 노이즈 제거)
    const confirmed = new Set(
      Object.entries(freq)
        .filter(([, c]) => c >= 2)
        .map(([n]) => n)
    );

    // prefix 중복 제거: 가장 긴 이름 우선
    knownNames = new Set();
    [...confirmed]
      .sort((a, b) => b.length - a.length)
      .forEach(name => {
        const isRedundantPrefix = [...knownNames].some(n => n.startsWith(name + " "));
        if (!isRedundantPrefix) knownNames.add(name);
      });
  }

  // ── 아이폰 본 파싱용 정규식 ───────────────────────────
  // ✅ [태그] 필수, 태그 이후 나머지는 없을 수도 있음 (시스템 메시지)
  const regexIOS = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)\s\[([^\]]+)\](.*)/;

  // knownNames에서 가장 긴 이름을 우선 매칭 (탐욕적 이름 탐색)
  function findIOSName(rest) {
    const words = rest.split(/\s+/);
    for (let len = Math.min(3, words.length - 1); len >= 1; len--) {
      const candidate = words.slice(0, len).join(" ");
      if (knownNames.has(candidate)) {
        return [candidate, words.slice(len).join(" ")];
      }
    }
    return [null, rest];
  }

  // ── 본 파싱 루프 ───────────────────────────────────────
  lines.forEach(line => {

    // 안드로이드 포맷 시도
    const matchA = line.match(regexAndroidMain) || line.match(regexAndroidColon);
    if (matchA) {
      const date    = matchA[1].trim();
      const ampm    = matchA[2].trim();
      const time    = matchA[3].trim();
      const name    = normName(matchA[4]);
      const message = matchA.slice(5).join(":").trim();
      if (!name) return;
      chatData.push({ date, ampm, time, name, message });
      characters.add(name);
      return;
    }

    // 아이폰 포맷 시도
    if (knownNames !== null) {
      const matchI = line.match(regexIOS);
      if (matchI) {
        const date = matchI[1].trim();
        const ampm = matchI[2].trim();
        const time = matchI[3].trim();
        const tag  = matchI[4].trim();
        const rest = matchI[5].trim();

        if (rest === "") {
          // ✅ [태그]만 있고 뒤가 비어있음 → 시스템 메시지
          chatData.push({ date, ampm, time, name: "시스템", message: tag });
          characters.add("시스템");
        } else {
          // ✅ [태그] 이름 메시지 → rest에서 이름 분리
          const [name, message] = findIOSName(rest);
          if (name) {
            const normN = normName(name);
            chatData.push({ date, ampm, time, name: normN, message: message.trim() });
            characters.add(normN);
          }
          // 이름 미확정 줄은 조용히 스킵
        }
        return;
      }
    }

    // ✅ 멀티라인 이어붙이기 — 빈 줄, 타임스탬프, [태그] 시작 줄은 스킵
    // [태그] 로 시작하는 줄은 타임스탬프 없는 새 발화이므로 이어붙이면 안 됨
    const tagLinePrefix = /^\[[^\]]+\]\s/;
    if (
      chatData.length > 0 &&
      line.trim() !== "" &&
      !timestampPrefix.test(line) &&
      !tagLinePrefix.test(line)
    ) {
      chatData[chatData.length - 1].message += "\n" + line;
    }
  });

  // 앞뒤 공백 정리 + 빈 메시지 제거
  chatData.forEach(c => { c.message = c.message.trim(); });
  chatData = chatData.filter(c => c.message.length > 0);

  if (chatData.length === 0) {
    showToast("⚠️ 파싱된 메시지가 없습니다. 파일 형식을 확인하세요.");
    return;
  }

  downloadBtn.disabled = false;
  createCharacterList([...characters]);
  renderStats(characters.size);
  renderChat();
}

/* =====================
   등장인물 목록 생성
   (시스템 포함 모든 캐릭터 동일하게 처리)
   ===================== */
function createCharacterList(characters) {
  characterList.innerHTML = "";
  characterCount.textContent = characters.length;

  characters.sort().forEach(name => {
    const row = document.createElement("div");
    row.className = "character-row";

    const normN    = normName(name);
    const imgSrc   = profileImages[normN] || DEFAULT_PROFILE;
    const safeName = escapeHtml(normN);
    const hasProfile = !!profileImages[normN];

    row.innerHTML = `
      <img src="${escapeAttr(imgSrc)}" alt="${safeName} 프로필">
      <span class="char-name">${safeName}</span>
      <span class="char-upload-btn" title="${hasProfile ? "프로필 사진 변경" : "프로필 사진 추가"}">${hasProfile ? "✏️" : "+"}</span>
      <input type="file" accept="image/*" hidden>
    `;

    const input   = row.querySelector("input[type=file]");
    const imgEl   = row.querySelector("img");
    const editBtn = row.querySelector(".char-upload-btn");

    editBtn.addEventListener("click", e => {
      e.stopPropagation();
      input.click();
    });

    input.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;

      if (file.size > 1024 * 1024) {
        showToast("⚠️ 이미지가 1MB를 초과합니다. 저장 공간에 주의하세요.");
      }

      const reader = new FileReader();
      reader.onload = () => {
        // 64×64로 리사이즈 & JPEG 압축
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width  = 64;
          canvas.height = 64;
          const ctx  = canvas.getContext("2d");
          const size = Math.min(image.width, image.height);
          const sx   = (image.width  - size) / 2;
          const sy   = (image.height - size) / 2;
          ctx.drawImage(image, sx, sy, size, size, 0, 0, 64, 64);
          const compressed = canvas.toDataURL("image/jpeg", 0.8);

          profileImages[normN] = compressed;
          imgEl.src = compressed;
          editBtn.textContent = "✏️";
          editBtn.title = "프로필 사진 변경";

          try {
            localStorage.setItem("profileImages", JSON.stringify(profileImages));
            showToast(`✅ ${normN} 프로필이 변경되었습니다.`);
          } catch (err) {
            showToast("⚠️ 프로필 저장 실패: 저장 공간이 부족합니다.");
            console.warn("localStorage 저장 실패:", err);
          }

          renderChat(searchInput.value.trim());
        };
        image.onerror = () => showToast("❌ 이미지 로드 실패");
        image.src = reader.result;
      };
      reader.onerror = () => showToast("❌ 파일 읽기 실패");
      reader.readAsDataURL(file);
      input.value = "";
    });

    characterList.appendChild(row);
  });
}

/* =====================
   통계
   ===================== */
function renderStats(charCount) {
  const total   = chatData.length;
  const dateSet = new Set(chatData.map(c => c.date));
  statsBox.innerHTML =
    `총 <strong>${total.toLocaleString()}</strong>개 메시지<br>` +
    `<strong>${dateSet.size}</strong>일 · <strong>${charCount}</strong>명`;
}

/* =====================
   채팅 렌더링
   ===================== */
function renderChat(keyword = "") {
  chatContainer.innerHTML = "";

  if (chatData.length === 0) {
    chatContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📄</div>
        <p class="empty-title">TXT 파일을 불러오세요</p>
        <p class="empty-desc">BAND 앱 → 채팅 → 더보기 → 내보내기로<br>저장한 .txt 파일을 업로드하세요.</p>
        <label class="btn-upload-center" for="txtFile">파일 선택</label>
      </div>`;
    return;
  }

  const safeKeyword = keyword ? escapeRegex(keyword) : "";

  let currentDate = "";
  let matchCount  = 0;
  const fragment  = document.createDocumentFragment();

  chatData.forEach(chat => {
    if (
      safeKeyword &&
      !chat.message.includes(keyword) &&
      !chat.name.includes(keyword)
    ) return;

    matchCount++;

    if (currentDate !== chat.date) {
      currentDate = chat.date;
      const divider = document.createElement("div");
      divider.className = "date-divider";
      divider.innerHTML = `<span>${escapeHtml(chat.date)}</span>`;
      fragment.appendChild(divider);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "message";

    const profile = profileImages[chat.name] || DEFAULT_PROFILE;

    const profileImg = document.createElement("img");
    profileImg.className = "profile";
    profileImg.src = profile;
    profileImg.alt = chat.name;

    const content = document.createElement("div");
    content.className = "content";

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = chat.name;

    const bubble = document.createElement("div");
    bubble.className = "bubble";
    bubble.innerHTML = formatMessage(chat.message, keyword);

    const timeEl = document.createElement("div");
    timeEl.className = "time";
    timeEl.textContent = `${chat.ampm} ${chat.time}`;

    content.appendChild(nameEl);
    content.appendChild(bubble);
    content.appendChild(timeEl);
    wrapper.appendChild(profileImg);
    wrapper.appendChild(content);
    fragment.appendChild(wrapper);
  });

  if (safeKeyword && matchCount === 0) {
    const noResult = document.createElement("div");
    noResult.className = "no-result";
    noResult.textContent = `"${keyword}" 검색 결과가 없습니다.`;
    fragment.appendChild(noResult);
  }

  chatContainer.appendChild(fragment);

  if (!safeKeyword) {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  } else {
    chatContainer.scrollTop = 0;
  }
}

/* =====================
   메시지 꾸미기
   ===================== */
function formatMessage(text, keyword = "") {
  // 1. HTML 이스케이프
  text = escapeHtml(text);
  // 2. 줄바꿈 → <br> (escapeHtml 이후에 처리해야 안전)
  text = text.replace(/\n/g, "<br>");
  // 3. @멘션
  text = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="mention">@$1</span>');
  // 4. RP 괄호
  text = text.replace(/\((.*?)\)/g, '<span class="rp">($1)</span>');
  // 5. 검색어 강조
  if (keyword) {
    const escapedKw = escapeHtml(keyword);
    const regex = new RegExp(escapeRegex(escapedKw), "gi");
    text = text.replace(regex, match => `<span class="highlight">${match}</span>`);
  }
  return text;
}

/* =====================
   HTML 이스케이프
   ===================== */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g,  "&amp;")
    .replace(/</g,  "&lt;")
    .replace(/>/g,  "&gt;")
    .replace(/"/g,  "&quot;")
    .replace(/'/g,  "&#39;");
}

function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =====================
   HTML 백업
   ===================== */
async function exportHTML() {
  try {
    let css = "";
    const linkEl = document.querySelector('link[rel="stylesheet"]');
    if (linkEl) {
      try {
        const res = await fetch(linkEl.href);
        if (res.ok) css = await res.text();
      } catch {
        document.querySelectorAll("style").forEach(s => { css += s.textContent; });
      }
    }

    const chatHTML = chatContainer.innerHTML;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BAND 채팅 백업</title>
<style>
${css}

/* 백업 전용 오버라이드: 앱 레이아웃 해제 → 일반 스크롤 문서로 */
html, body {
  height: auto !important;
  overflow: auto !important;
  background: #f0f2f5;
}
body {
  display: block !important;
  padding: 20px;
}
#chatContainer {
  max-width: 760px;
  margin: 0 auto;
  overflow: visible !important;
  height: auto !important;
  flex: unset !important;
}
.message { animation: none !important; }
</style>
</head>
<body>
<div id="chatContainer">
${chatHTML}
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    const now     = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    a.download    = `band_backup_${dateStr}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
    showToast("✅ HTML 파일이 저장되었습니다.");
  } catch (error) {
    console.error(error);
    showToast("❌ HTML 생성 실패: " + error.message);
  }
}

/* =====================
   토스트 알림
   ===================== */
let toastTimer = null;
function showToast(message, duration = 2800) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), duration);
}
