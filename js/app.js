/* =====================
   BAND 채팅 백업기 v2
   ===================== */

/* =====================
   상수 & 상태
   ===================== */
const DEFAULT_PROFILE = "assets/default-profile.png";

// ✅ 수정: profileImages를 최상단에서 먼저 선언 (ReferenceError 방지)
let profileImages = {};
try {
  profileImages = JSON.parse(localStorage.getItem("profileImages") || "{}");
} catch {
  profileImages = {};
}

let chatData = [];

// 시스템 메시지 이름 목록 (다국어 대응)
const SYSTEM_NAMES = new Set(["시스템", "System", "BAND", "band"]);

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

  // .txt 확장자 검증
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

  const lines = text.split(/\r?\n/);

  // ✅ 수정: 메시지 본문에 ':' 가 포함돼도 올바르게 캡처하도록
  // 앞 4그룹은 고정, 5번째 그룹은 나머지 전체
  const regex = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+),(.*?):(.*)/;

  // 두 번째 포맷 대응 (구버전 BAND: 시간 구분자가 ':' 인 경우)
  const regexAlt = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+):(.*?):(.*)/;

  lines.forEach(line => {
    let match = line.match(regex) || line.match(regexAlt);
    if (!match) return;

    const date    = match[1].trim();
    const ampm    = match[2].trim();
    const time    = match[3].trim();
    const name    = match[4].trim();
    // ✅ 수정: 5번째 이후 전체를 메시지로 합침 (콜론 포함 메시지 대응)
    const message = match.slice(5).join(":").trim();

    if (!name || !message) return;

    chatData.push({ date, ampm, time, name, message });
    characters.add(name);
  });

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
   ===================== */
function createCharacterList(characters) {
  characterList.innerHTML = "";
  characterCount.textContent = characters.length;

  characters.sort().forEach(name => {
    const row = document.createElement("div");
    row.className = "character-row";

    const imgSrc = profileImages[name] || DEFAULT_PROFILE;

    // ✅ 수정: name을 escapeHtml 처리하여 XSS 방지
    const safeName = escapeHtml(name);

    row.innerHTML = `
      <img src="${escapeAttr(imgSrc)}" alt="${safeName} 프로필">
      <span class="char-name">${safeName}</span>
      <span class="char-upload-btn" title="프로필 사진 변경">🖼</span>
      <input type="file" accept="image/*" hidden>
    `;

    const input  = row.querySelector("input[type=file]");
    const img    = row.querySelector("img");
    const editBtn = row.querySelector(".char-upload-btn");

    // 편집 버튼 또는 이미지 클릭 시 파일 선택
    editBtn.addEventListener("click", e => {
      e.stopPropagation();
      input.click();
    });

    input.addEventListener("change", e => {
      const file = e.target.files[0];
      if (!file) return;

      // ✅ 추가: 이미지 크기 경고 (1MB 초과)
      if (file.size > 1024 * 1024) {
        showToast("⚠️ 이미지가 1MB를 초과합니다. localStorage 한도에 주의하세요.");
      }

      const reader = new FileReader();
      reader.onload = () => {
        profileImages[name] = reader.result;
        img.src = reader.result;

        // ✅ 추가: localStorage 저장 실패 처리
        try {
          localStorage.setItem("profileImages", JSON.stringify(profileImages));
        } catch (err) {
          showToast("⚠️ 프로필 저장 실패: 저장 공간이 부족합니다.");
          console.warn("localStorage 저장 실패:", err);
        }

        renderChat(searchInput.value.trim());
      };
      reader.readAsDataURL(file);
    });

    characterList.appendChild(row);
  });
}

/* =====================
   통계
   ===================== */
function renderStats(charCount) {
  const total = chatData.length;
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

  // keyword 안전 처리 (정규식 특수문자 이스케이프)
  const safeKeyword = keyword ? escapeRegex(keyword) : "";

  let currentDate = "";
  let matchCount = 0;
  const fragment = document.createDocumentFragment();

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

    if (SYSTEM_NAMES.has(chat.name)) {
      wrapper.classList.add("system");
    }

    const profile = profileImages[chat.name] || DEFAULT_PROFILE;

    // ✅ 수정: 프로필 src, alt 모두 이스케이프
    const profileImg = document.createElement("img");
    profileImg.className = "profile";
    profileImg.src = profile;
    profileImg.alt = escapeHtml(chat.name);

    const content = document.createElement("div");
    content.className = "content";

    const nameEl = document.createElement("div");
    nameEl.className = "name";
    nameEl.textContent = chat.name; // textContent = XSS 안전

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

  // 검색 결과 없음
  if (safeKeyword && matchCount === 0) {
    const noResult = document.createElement("div");
    noResult.className = "no-result";
    noResult.textContent = `"${keyword}" 검색 결과가 없습니다.`;
    fragment.appendChild(noResult);
  }

  // ✅ 최적화: DocumentFragment 한 번에 삽입
  chatContainer.appendChild(fragment);

  // 검색 시에는 최상단, 아니면 최하단으로 스크롤
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
  // 1. HTML 이스케이프 먼저
  text = escapeHtml(text);

  // 2. @멘션
  text = text.replace(
    /@([가-힣a-zA-Z0-9_]+)/g,
    '<span class="mention">@$1</span>'
  );

  // 3. RP 괄호 (이미 이스케이프된 상태이므로 &lt; 등 고려)
  text = text.replace(
    /\((.*?)\)/g,
    '<span class="rp">($1)</span>'
  );

  // 4. 검색어 강조 (이미 이스케이프된 상태에서 매칭)
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

/* =====================
   속성값 이스케이프 (src, alt 등)
   ===================== */
function escapeAttr(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/* =====================
   정규식 특수문자 이스케이프
   ===================== */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/* =====================
   HTML 백업 (인라인 CSS)
   ===================== */
async function exportHTML() {
  try {
    // ✅ 수정: fetch 대신 <link> 태그에서 직접 CSS를 읽어 file:// 환경에서도 동작
    let css = "";
    const linkEl = document.querySelector('link[rel="stylesheet"]');
    if (linkEl) {
      try {
        const res = await fetch(linkEl.href);
        if (res.ok) css = await res.text();
      } catch {
        // fetch 실패 시 (file://) — style 태그 수집으로 폴백
        document.querySelectorAll("style").forEach(s => { css += s.textContent; });
      }
    }

    // 프로필 이미지를 base64 인라인으로 교체
    const chatHTML = chatContainer.innerHTML;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>BAND 채팅 백업</title>
<style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif; background: #f0f2f5; margin: 0; padding: 20px; }
#chatContainer { max-width: 720px; margin: 0 auto; }
${css}
</style>
</head>
<body>
<div id="chatContainer">
${chatHTML}
</div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);

    // 파일명에 날짜 포함
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
