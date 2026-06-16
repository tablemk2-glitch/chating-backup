/* =====================
   BAND 채팅 백업기 v3.0
   ===================== */

/* =====================
   상수 & 상태
   ===================== */
const DEFAULT_PROFILE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjOWNkZDYiLz4KICA8Y2lyY2xlIGN4PSIyMCIgY3k9IjE2IiByPSI3IiBmaWxsPSIjZmZmIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzYiIHJ4PSIxMiIgcnk9IjkiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==";

// profileImages: localStorage에서 복원 (키 정규화 포함)
let profileImages = {};
try {
  const raw = JSON.parse(localStorage.getItem("profileImages") || "{}");
  for (const [key, val] of Object.entries(raw)) {
    profileImages[key.trim().replace(/\s+/g, " ")] = val;
  }
} catch {
  profileImages = {};
}

// manualCharacters: txt 없이 수동 추가한 등장인물 목록
let manualCharacters = [];
try {
  manualCharacters = JSON.parse(localStorage.getItem("manualCharacters") || "[]");
} catch {
  manualCharacters = [];
}

let chatData = [];
// txt에서 파싱된 등장인물 (Set → Array)
let parsedCharacters = [];

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
const addCharBtn     = document.getElementById("addCharBtn");
const addCharInput   = document.getElementById("addCharInput");

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

// 등장인물 추가 버튼
addCharBtn.addEventListener("click", handleAddCharacter);
addCharInput.addEventListener("keydown", e => {
  if (e.key === "Enter") handleAddCharacter();
});

/* =====================
   초기 렌더링
   ===================== */
// 페이지 로드 시 저장된 등장인물 목록 표시
renderCharacterList();

/* =====================
   등장인물 수동 추가
   ===================== */
function handleAddCharacter() {
  const name = addCharInput.value.trim().replace(/\s+/g, " ");
  if (!name) return;

  // 이미 존재하는 이름이면 스킵
  const allChars = getMergedCharacters();
  if (allChars.includes(name)) {
    showToast(`⚠️ "${name}"은(는) 이미 목록에 있습니다.`);
    addCharInput.value = "";
    return;
  }

  manualCharacters.push(name);
  saveManualCharacters();
  addCharInput.value = "";
  renderCharacterList();
  showToast(`✅ "${name}" 추가되었습니다.`);
}

function saveManualCharacters() {
  try {
    localStorage.setItem("manualCharacters", JSON.stringify(manualCharacters));
  } catch {
    showToast("⚠️ 등장인물 저장 실패: 저장 공간이 부족합니다.");
  }
}

/* =====================
   등장인물 병합
   parsedCharacters + manualCharacters 합쳐서 중복 제거 후 정렬
   ===================== */
function getMergedCharacters() {
  const set = new Set([...parsedCharacters, ...manualCharacters]);
  return [...set].sort();
}

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
  const newParsedSet = new Set();

  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const timestampPrefix = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+/;

  // ── 안드로이드: 콜론 기준만 사용 ──────────────────────
  const regexAndroid = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)[,\s]*\s*([^:]+?)\s*:(.*)/;

  // ── 아이폰: 빈도 기반 이름 확정 ───────────────────────
   const regexIOSRaw = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+\s(?:\[[^\]]*\]\s+)?(\S+)\s/;
   const regexIOS    = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)\s(?:\[[^\]]*\]\s+)?(\S+)\s(.*)/;

   // 포맷 판별
  const isAndroid = lines.some(l => regexAndroid.test(l));

  let knownNames = null;

  if (!isAndroid) {
    // 아이폰: 1회 스캔으로 빈도 집계 → 2회 이상 = 이름
    const freq = {};
    lines.forEach(line => {
      const m = line.match(regexIOSRaw);
      if (!m) return;
      freq[m[1]] = (freq[m[1]] || 0) + 1;
    });
    knownNames = new Set(
      Object.entries(freq)
        .filter(([, count]) => count >= 2)
        .map(([name]) => name)
    );
  }

  // 본 파싱
  lines.forEach(line => {
    // 안드로이드
    if (isAndroid) {
      const match = line.match(regexAndroid);
      if (match) {
        const date    = match[1].trim();
        const ampm    = match[2].trim();
        const time    = match[3].trim();
        const name    = match[4].trim().replace(/\s+/g, " ");
        const message = match[5].trim();
        if (!name) return;
        chatData.push({ date, ampm, time, name, message });
        newParsedSet.add(name);
        return;
      }
    }

    // 아이폰
    if (!isAndroid && knownNames !== null) {
      const match = line.match(regexIOS);
      if (match) {
        const date      = match[1].trim();
        const ampm      = match[2].trim();
        const time      = match[3].trim();
        const candidate = match[4].trim(); // ✅ [5] → 4번 (태그 캡처 제거로 인덱스 당겨짐)
      
        if (knownNames.has(candidate)) {
          const message = match[5].trim(); // ✅ 5번
          chatData.push({ date, ampm, time, name: candidate, message });
          characters.add(candidate);
          return;
        }
      
        const fullMessage = (match[4] + " " + match[5]).trim();
        chatData.push({ date, ampm, time, name: "알 수 없음", message: fullMessage });
        return;
      }
    }

    // 멀티라인
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

  // ✅ parsedCharacters 갱신 (기존 profileImages는 건드리지 않음)
  parsedCharacters = [...newParsedSet].sort();

  downloadBtn.disabled = false;
  renderCharacterList();
  renderStats();
  renderChat();
}

/* =====================
   등장인물 목록 렌더링
   manual + parsed 병합 표시
   ===================== */
function renderCharacterList() {
  characterList.innerHTML = "";
  const merged = getMergedCharacters();
  characterCount.textContent = merged.length;

  if (merged.length === 0) {
    characterList.innerHTML = `
      <div class="char-empty">
        <p>아래에서 등장인물을<br>미리 추가하세요</p>
      </div>`;
    return;
  }

  merged.forEach(name => {
    const row = document.createElement("div");
    row.className = "character-row";

    const normalizedName = name.trim();
    const imgSrc   = profileImages[normalizedName] || DEFAULT_PROFILE;
    const safeName = escapeHtml(normalizedName);
    const hasProfile = !!profileImages[normalizedName];
    const isManualOnly = !parsedCharacters.includes(normalizedName);

    row.innerHTML = `
      <img src="${escapeAttr(imgSrc)}" alt="${safeName} 프로필">
      <span class="char-name">${safeName}</span>
      ${isManualOnly ? `<span class="char-badge" title="수동 추가">✋</span>` : ""}
      <span class="char-upload-btn" title="${hasProfile ? "프로필 사진 변경" : "프로필 사진 추가"}">${hasProfile ? "✏️" : "+"}</span>
      ${isManualOnly ? `<span class="char-delete-btn" title="삭제">✕</span>` : ""}
      <input type="file" accept="image/*" hidden>
    `;

    const input     = row.querySelector("input[type=file]");
    const imgEl     = row.querySelector("img");
    const editBtn   = row.querySelector(".char-upload-btn");
    const deleteBtn = row.querySelector(".char-delete-btn");

    // 프로필 업로드
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
          canvas.width = canvas.height = 64;
          const ctx = canvas.getContext("2d");
          const size = Math.min(image.width, image.height);
          const sx = (image.width  - size) / 2;
          const sy = (image.height - size) / 2;
          ctx.drawImage(image, sx, sy, size, size, 0, 0, 64, 64);

          const compressed = canvas.toDataURL("image/jpeg", 0.8);
          profileImages[normalizedName] = compressed;
          imgEl.src = compressed;
          editBtn.textContent = "✏️";
          editBtn.title = "프로필 사진 변경";

          try {
            localStorage.setItem("profileImages", JSON.stringify(profileImages));
            showToast(`✅ ${normalizedName} 프로필이 변경되었습니다.`);
          } catch {
            showToast("⚠️ 프로필 저장 실패: 저장 공간이 부족합니다.");
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

    // 수동 추가 인물만 삭제 가능
    if (deleteBtn) {
      deleteBtn.addEventListener("click", e => {
        e.stopPropagation();
        manualCharacters = manualCharacters.filter(n => n !== normalizedName);
        saveManualCharacters();
        renderCharacterList();
        showToast(`🗑️ "${normalizedName}" 삭제되었습니다.`);
      });
    }

    characterList.appendChild(row);
  });
}

/* =====================
   통계
   ===================== */
function renderStats() {
  const total   = chatData.length;
  const dateSet = new Set(chatData.map(c => c.date));
  const charCount = getMergedCharacters().length;
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
  text = escapeHtml(text);
  text = text.replace(/\n/g, "<br>");
  text = text.replace(/@([가-힣a-zA-Z0-9_]+)/g, '<span class="mention">@$1</span>');
  text = text.replace(/\((.*?)\)/g, '<span class="rp">($1)</span>');

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
   HTML 백업 (형식 유지)
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

    let profileCss = ":root {\n";
    for (const [name, src] of Object.entries(profileImages)) {
      const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
      profileCss += `  --profile-${safeName}: url("${src}");\n`;
    }
    profileCss += "}\n";

    let chatHTML = chatContainer.innerHTML;
    for (const [name, src] of Object.entries(profileImages)) {
      const safeName = name.replace(/[^a-zA-Z0-9가-힣]/g, "_");
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
    const a    = document.createElement("a");
    a.href     = URL.createObjectURL(blob);
    const now  = new Date();
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
