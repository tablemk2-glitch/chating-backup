/* =====================
   BAND 채팅 백업기 v2.1
   ===================== */

/* =====================
   상수 & 상태
   ===================== */

// 기본 프로필: PNG 파일 의존 없이 SVG를 base64로 내장
const DEFAULT_PROFILE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjOWNkZDYiLz4KICA8Y2lyY2xlIGN4PSIyMCIgY3k9IjE2IiByPSI3IiBmaWxsPSIjZmZmIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzYiIHJ4PSIxMiIgcnk9IjkiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==";

// profileImages를 최상단에서 먼저 선언 (ReferenceError 방지)
let profileImages = {};
try {
  const raw = JSON.parse(localStorage.getItem("profileImages") || "{}");
  // 저장된 키를 정규화하여 재구성
  for (const [key, val] of Object.entries(raw)) {
    profileImages[key.trim().replace(/\s+/g, " ")] = val;
  }
} catch {
  profileImages = {};
}

let chatData = [];

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
  reader.onload = () => {
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

  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const timestampPrefix = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+/;

  // ── 안드로이드 포맷 ────────────────────────────────────
  const regexAndroidMain  = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)[,\s]\s*(.+?)\s*:(.*)/;
  const regexAndroidColon = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+):([^:]+):(.*)/;

  // ── 아이폰 포맷: 타임스탬프 + 선택적 태그 + 이름 후보 추출 ──
  // "2026년 2월 11일 오전 1:28 [아쿠아리움] 홍연지 메시지"
  // "2026년 2월 11일 오전 12:33 시스템 메시지"
  const regexIOSRaw = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+\s(?:\[[^\]]+\]\s)?(\S+)\s/;

  // ── Step 1: 아이폰 포맷인지 판별 + 이름 후보 빈도 계산 ──
  const isAndroid = lines.some(l => regexAndroidMain.test(l) || regexAndroidColon.test(l));

  let knownNames = null; // null이면 안드로이드 모드

  if (!isAndroid) {
    const freq = {};
    lines.forEach(line => {
      const m = line.match(regexIOSRaw);
      if (!m) return;
      const token = m[1];
      freq[token] = (freq[token] || 0) + 1;
    });

    // 2회 이상 등장한 토큰 → 이름으로 확정
    knownNames = new Set(
      Object.entries(freq)
        .filter(([, count]) => count >= 2)
        .map(([name]) => name)
    );
  }

  // ── 아이폰 파싱용 정규식 (태그 그룹 캡처 포함) ──
  // match[4] = 태그 내용(있을 때), match[5] = 이름, match[6] = 메시지
  const regexIOS = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)\s(?:\[([^\]]+)\]\s)?(\S+)\s(.*)/;

  // ── Step 2: 본 파싱 ────────────────────────────────────
  lines.forEach(line => {
    // 안드로이드 포맷 시도
    let match = line.match(regexAndroidMain) || line.match(regexAndroidColon);
    if (match) {
      const date    = match[1].trim();
      const ampm    = match[2].trim();
      const time    = match[3].trim();
      const name    = match[4].trim().replace(/\s+/g, " ");
      const message = match.slice(5).join(":").trim();
      if (!name) return;
      chatData.push({ date, ampm, time, name, message });
      characters.add(name);
      return;
    }

    // 아이폰 포맷 시도
    if (knownNames !== null) {
      match = line.match(regexIOS);
      if (match) {
        const date      = match[1].trim();
        const ampm      = match[2].trim();
        const time      = match[3].trim();
        const candidate = match[5].trim();

        // ✅ 빈도 기반으로 확정된 이름인지 검증
        if (knownNames.has(candidate)) {
          const message = match[6].trim();
          chatData.push({ date, ampm, time, name: candidate, message });
          characters.add(candidate);
          return;
        }

        // 이름 후보가 아닐 경우 → 이름+이후 전체가 메시지인 경우
        // (1회성 단어가 이름 자리에 온 엣지케이스 처리)
        const fullMessage = (match[5] + " " + match[6]).trim();
        // 직전 메시지가 같은 타임스탬프라면 이어붙임, 아니면 "알 수 없음"으로 저장
        chatData.push({ date, ampm, time, name: "알 수 없음", message: fullMessage });
        return;
      }
    }

    // 타임스탬프 없는 줄 → 멀티라인으로 이어 붙임
    if (chatData.length > 0 && !timestampPrefix.test(line)) {
      chatData[chatData.length - 1].message += "\n" + line;
    }
  });

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

    const normalizedName = name.trim();
    const imgSrc  = profileImages[normalizedName] || DEFAULT_PROFILE;
    const safeName = escapeHtml(normalizedName);

    // ✅ 이미 사진이 있으면 ✏️, 없으면 +
    const hasProfile = !!profileImages[normalizedName];
    const iconLabel  = hasProfile ? "✏️" : "+";

    row.innerHTML = `
      <img src="${escapeAttr(imgSrc)}" alt="${safeName} 프로필">
      <span class="char-name">${safeName}</span>
      <span class="char-upload-btn" title="${hasProfile ? "프로필 사진 변경" : "프로필 사진 추가"}">${iconLabel}</span>
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
        const image = new Image();
        image.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width  = 64;
          canvas.height = 64;
          const ctx = canvas.getContext("2d");

          const size = Math.min(image.width, image.height);
          const sx = (image.width  - size) / 2;
          const sy = (image.height - size) / 2;
          ctx.drawImage(image, sx, sy, size, size, 0, 0, 64, 64);

          const compressed = canvas.toDataURL("image/jpeg", 0.8);

          profileImages[normalizedName] = compressed;
          imgEl.src = compressed;

          // ✅ 업로드 후 아이콘을 ✏️로 교체
          editBtn.textContent = "✏️";
          editBtn.title = "프로필 사진 변경";

          try {
            localStorage.setItem("profileImages", JSON.stringify(profileImages));
            showToast(`✅ ${normalizedName} 프로필이 변경되었습니다.`);
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

    // 날짜 구분선
    if (currentDate !== chat.date) {
      currentDate = chat.date;
      const divider = document.createElement("div");
      divider.className = "date-divider";
      divider.innerHTML = `<span>${escapeHtml(chat.date)}</span>`;
      fragment.appendChild(divider);
    }

    const wrapper = document.createElement("div");
    wrapper.className = "message";

    // 프로필 이미지 (모든 캐릭터 동일하게 — DEFAULT_PROFILE은 base64 내장)
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
  text = escapeHtml(text);

  // ✅ 줄바꿈 → <br> 변환 (escapeHtml 이후에 처리해야 안전)
  text = text.replace(/\n/g, "<br>");

  text = text.replace(
    /@([가-힣a-zA-Z0-9_]+)/g,
    '<span class="mention">@$1</span>'
  );

  text = text.replace(
    /\((.*?)\)/g,
    '<span class="rp">($1)</span>'
  );

  if (keyword) {
    const escapedKw = escapeHtml(keyword);
    const regex = new RegExp(escapeRegex(escapedKw), "gi");
    text = text.replace(
      regex,
      match => `<span class="highlight">${match}</span>`
    );
  }

  return text;
}

/* =====================
   HTML 이스케이프
   ===================== */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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
   exportHTML: 저장된 HTML이 단독으로 스크롤되도록
   · layout/height 의존 CSS 제거하고 단순 스크롤 문서로 재구성
   · 프로필 이미지가 base64이므로 외부 파일 참조 없음
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

    // ✅ 프로필 이미지를 CSS 변수로 추출 (메시지마다 반복 삽입 제거)
    let profileCss = ":root {\n";
    for (const [name, src] of Object.entries(profileImages)) {
      const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      profileCss += `  --profile-${safeName}: url("${src}");\n`;
    }
    profileCss += "}\n";

    // ✅ img src 대신 CSS 변수 참조하도록 채팅 HTML 변환
    let chatHTML = chatContainer.innerHTML;
    for (const [name, src] of Object.entries(profileImages)) {
      const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      // base64 src를 CSS background-image 방식으로 교체
      chatHTML = chatHTML.replaceAll(
        `src="${src}"`,
        `src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==" data-profile="${safeName}"`
      );
    }

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BAND 채팅 백업</title>
<style>
${css}
${profileCss}

html, body { height: auto !important; overflow: auto !important; background: #f0f2f5; }
body { display: block !important; padding: 20px; }
#chatContainer { max-width: 760px; margin: 0 auto; overflow: visible !important; height: auto !important; flex: unset !important; }
.message { animation: none !important; }

/* ✅ CSS 변수로 프로필 이미지 적용 */
${Object.keys(profileImages).map(name => {
  const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
  return `img[data-profile="${safeName}"] { content: var(--profile-${safeName}); }`;
}).join("\n")}
</style>
</head>
<body>
<div id="chatContainer">${chatHTML}</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const now = new Date();
    const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,"0")}${String(now.getDate()).padStart(2,"0")}`;
    a.download = `band_backup_${dateStr}.html`;
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
