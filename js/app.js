const DEFAULT_PROFILE =
"assets/default-profile.png";

const profile =
profileImages[chat.name]
?? DEFAULT_PROFILE;

const txtFile = document.getElementById("txtFile");
const searchInput = document.getElementById("searchInput");
const downloadBtn = document.getElementById("downloadBtn");

const characterList =
document.getElementById("characterList");

const chatContainer =
document.getElementById("chatContainer");

let chatData = [];

let profileImages =
JSON.parse(
localStorage.getItem("profileImages")
|| "{}"
);

/* =====================
이벤트 등록
===================== */

txtFile.addEventListener(
"change",
handleTxtUpload
);

searchInput.addEventListener(
"input",
e => {


renderChat(
    e.target.value.trim()
);


});

downloadBtn.addEventListener(
"click",
exportHTML
);

/* =====================
TXT 업로드
===================== */

function handleTxtUpload(e){

 
const file =
e.target.files[0];

if(!file) return;

const reader =
new FileReader();

reader.onload = () => {

    parseChat(
        reader.result
    );

};

reader.readAsText(
    file,
    "utf-8"
);
 

}

/* =====================
채팅 파싱
===================== */

function parseChat(text){

 
chatData = [];

const characters =
new Set();

const lines =
text.split(/\r?\n/);

const regex =
 

/(\d{4}년 \d+월 \d+일)\s(오전|오후)\s(\d+:\d+):(.*?):(.*)/;

 
lines.forEach(line => {

    const match =
    line.match(regex);

    if(!match) return;

    const date =
    match[1];

    const ampm =
    match[2];

    const time =
    match[3];

    const name =
    match[4].trim();

    const message =
    match[5].trim();

    chatData.push({

        date,
        ampm,
        time,
        name,
        message

    });

    characters.add(name);

});

createCharacterList(
    [...characters]
);

renderChat();
 

}

/* =====================
등장인물 목록 생성
===================== */

function createCharacterList(characters){

 
characterList.innerHTML = "";

characters.sort();

characters.forEach(name => {

    const row =
    document.createElement("div");

    row.className =
    "character-row";

    const DEFAULT_PROFILE =
    "assets/default-profile.png";

    const imgSrc =
    profileImages[name]
    || DEFAULT_PROFILE;

    row.innerHTML = `
        <img
        src="${imgSrc}"
        alt="">

        <span>${name}</span>

        <input
        type="file"
        accept="image/*">
    `;

    const input =
    row.querySelector("input");

    const img =
    row.querySelector("img");

    input.addEventListener(
    "change",
    e => {

        const file =
        e.target.files[0];

        if(!file) return;

        const reader =
        new FileReader();

        reader.onload = () => {

            profileImages[name] =
            reader.result;

            img.src =
            reader.result;

            localStorage.setItem(
                "profileImages",
                JSON.stringify(
                    profileImages
                )
            );

            renderChat(
                searchInput.value
            );

        };

        reader.readAsDataURL(
            file
        );

    });

    characterList.appendChild(
        row
    );

});
 

}

/* =====================
채팅 렌더링
===================== */

function renderChat(keyword=""){

 
chatContainer.innerHTML = "";

if(chatData.length === 0){

    chatContainer.innerHTML =
    `<div class="empty">
    채팅 데이터 없음
    </div>`;

    return;
}

let currentDate = "";

chatData.forEach(chat => {

    if(
        keyword &&
        !chat.message.includes(keyword) &&
        !chat.name.includes(keyword)
    ){
        return;
    }

    if(currentDate !== chat.date){

        currentDate =
        chat.date;

        const divider =
        document.createElement(
            "div"
        );

        divider.className =
        "date-divider";

        divider.innerHTML =
        `<span>${chat.date}</span>`;

        chatContainer.appendChild(
            divider
        );
    }

    const wrapper =
    document.createElement(
        "div"
    );

    wrapper.className =
    "message";

    if(chat.name === "시스템"){

        wrapper.classList.add(
            "system"
        );

    }

    const profile =
    profileImages[chat.name]
    || DEFAULT_PROFILE;

    wrapper.innerHTML = `
        <img
        class="profile"
        src="${profile}">

        <div class="content">

            <div class="name">
                ${escapeHtml(
                    chat.name
                )}
            </div>

            <div class="bubble">

                ${formatMessage(
                    chat.message,
                    keyword
                )}

            </div>

            <div class="time">

                ${chat.ampm}
                ${chat.time}

            </div>

        </div>
    `;

    chatContainer.appendChild(
        wrapper
    );

});
 

}

/* =====================
메시지 꾸미기
===================== */

function formatMessage(
text,
keyword=""
){

 
text =
escapeHtml(text);

text =
text.replace(

    /@([가-힣a-zA-Z0-9_]+)/g,

    '<span class="mention">@$1</span>'
);

text =
text.replace(

    /\((.*?)\)/g,

    '<span class="rp">($1)</span>'
);

if(keyword){

    const regex =
    new RegExp(
        keyword,
        "gi"
    );

    text =
    text.replace(
        regex,
        match => `
        <span class="highlight">
        ${match}
        </span>`
    );
}

return text;
 

}

/* =====================
HTML 이스케이프
===================== */

function escapeHtml(text){

 
return text
.replace(/&/g,"&amp;")
.replace(/</g,"&lt;")
.replace(/>/g,"&gt;")
.replace(/"/g,"&quot;");
 

}

/* =====================
HTML 백업
===================== */

async function exportHTML(){

 
try{

    const cssResponse =
    await fetch(
        "css/style.css"
    );

    const css =
    await cssResponse.text();

    const html = `
 

<!DOCTYPE html>

<html lang="ko">

<head>

<meta charset="UTF-8">

<meta name="viewport"
content="width=device-width,
initial-scale=1.0">

<title>BAND Backup</title>

<style>
${css}
</style>

</head>

<body>

<div id="chatContainer">

${chatContainer.innerHTML}

</div>

</body>

</html>
`;

 
    const blob =
    new Blob(

        [html],

        {
            type:
            "text/html"
        }

    );

    const a =
    document.createElement(
        "a"
    );

    a.href =
    URL.createObjectURL(
        blob
    );

    a.download =
    "band_backup.html";

    a.click();

    URL.revokeObjectURL(
        a.href
    );

}
catch(error){

    console.error(error);

    alert(
    "HTML 생성 실패"
    );

}
 

}

