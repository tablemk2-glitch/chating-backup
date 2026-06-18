/* =====================
   BAND 채팅 백업기 v2.2
   ===================== */

const DEFAULT_PROFILE = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0MCA0MCI+CiAgPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNjOWNkZDYiLz4KICA8Y2lyY2xlIGN4PSIyMCIgY3k9IjE2IiByPSI3IiBmaWxsPSIjZmZmIi8+CiAgPGVsbGlwc2UgY3g9IjIwIiBjeT0iMzYiIHJ4PSIxMiIgcnk9IjkiIGZpbGw9IiNmZmYiLz4KPC9zdmc+Cg==";

let profileImages = {};
try {
  const raw = JSON.parse(localStorage.getItem("profileImages") || "{}");
  for (const [key, val] of Object.entries(raw)) {
    profileImages[normName(key)] = val;
  }
} catch {
  profileImages = {};
}

let chatData = [];

function normName(str) {
  return String(str).trim().replace(/\s+/g, " ");
}

const txtFile        = document.getElementById("txtFile");
const searchInput    = document.getElementById("searchInput");
const searchClear    = document.getElementById("searchClear");
const downloadBtn    = document.getElementById("downloadBtn");
const characterList  = document.getElementById("characterList");
const characterCount = document.getElementById("characterCount");
const chatContainer  = document.getElementById("chatContainer");
const statsBox       = document.getElementById("statsBox");
const toast          = document.getElementById("toast");

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

function parseChat(text) {
  chatData = [];
  const characters = new Set();

  text = text.replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/);

  const timestampPrefix = /^\d{4}년 \d+월 \d+일\s(?:오전|오후)\s\d+:\d+/;

  const regexAndroidMain  = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+)[,\s]\s*(.+?)\s*:(.*)/;
  const regexAndroidColon = /^(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+):([^:]+):(.*)/;

  lines.forEach(line => {
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

    if (
      chatData.length > 0 &&
      line.trim() !== "" &&
      !timestampPrefix.test(line)
    ) {
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

// ... 이하 createCharacterList, renderStats, renderChat, formatMessage,
//     escapeHtml, escapeAttr, escapeRegex, exportHTML, showToast 함수는 변경 없음
