let Utils = require('./utils.js')
let Crypto = require('./crypto.js')
let Post = require('./post.js')
let HtCache = require('./cache.js')

const CURRENT_VERSION = "0.5.3";
const VERSION_SOURCE = "https://raw.githubusercontent.com/anon25519/hiddenthread/main/version.info";
const SCRIPT_SOURCE = 'https://github.com/anon25519/hiddenthread/raw/main/HiddenThread.user.js'

const STORAGE_KEY = "hiddenThread";

let getStorage = () => {
    let storage = localStorage.getItem(STORAGE_KEY) || "{}";
    return JSON.parse(storage);
}

let storage = getStorage()

let setStorage = (value) => {
    let newStorage = {
        ...getStorage(),
        ...value
    }
    storage = newStorage;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newStorage));
}

let passwordAliases = {};
let privateKeyAliases = {};
let otherPublicKeyAliases = {};

// [{alias:'...', value:'...'}, ...]
let passwords = [];
let privateKeys = [];
let otherPublicKeys = [];

function createElementFromHTML(htmlString) {
    let div = document.createElement('div');
    div.innerHTML = htmlString.trim();
    return div.firstElementChild;
}

function getImgName(url) {
    return url.split('/').pop().split('.')[0];
}

function getContainerName() {
    let placeholder = document.getElementById('htContainerName').placeholder;
    let value = document.getElementById('htContainerName').value;
    let fileName = value || placeholder;

    return fileName.endsWith('.png') ? fileName : `${fileName}.png`
}

function getContainerLocalFile() {
    let container = null;
    let containers = document.getElementById('hiddenContainerInput').files;
    if (containers.length == 0) {
        alert("Выберите файл!");
        return null;
    }

    let containersNum = new Array(containers.length);
    for (let i = 0; i < containersNum.length; i++) containersNum[i] = i;
    Utils.shuffleArray(containersNum, containersNum.length, Math);

    for (let num of containersNum) {
        if (containers[num].type == 'image/png' ||
            containers[num].type == 'image/jpeg') {
            container = containers[num];
            break;
        }
    }

    if (!container) {
        alert(containers.length == 1 ?
            "Выбранный файл должен быть JPG или PNG картинкой!" :
            "Хотя бы один из выбранных файлов должен быть JPG или PNG картинкой!");
        return null;
    }

    return container;
}

async function createHiddenPost() {
    let imageContainerDiv = document.getElementById('imageContainerDiv');
    imageContainerDiv.innerHTML = '';

    let maxDataRatio = 0;
    let isDownscaleAllowed = document.getElementById('isDownscaleAllowed').checked;
    if (document.getElementById('isDataRatioLimited').checked) {
        maxDataRatio = Math.min(Math.max(parseInt(document.getElementById('maxDataRatio').value), 1), 100) / 100;
    }

    let container = null;
    let containerType = document.getElementById('htContainerTypeSelect').selectedIndex;
    if (containerType == 1) {
        container = getContainerLocalFile();
        if (!container)
            return;
    } else if (containerType == 2) {
        // Для генерации создаем пустую картинку 1x1
        container = new ImageData(new Uint8ClampedArray(4), 1, 1);
        // Если не выбран процент заполнения, заполняем всё
        if (maxDataRatio == 0) maxDataRatio = 1;
    }

    let imageResult = await Post.createHiddenPostImpl(
        {
            'image': container,
            'maxDataRatio': maxDataRatio,
            'isDownscaleAllowed': isDownscaleAllowed
        },
        document.getElementById('hiddenPostInput').value,
        document.getElementById('hiddenFilesInput').files,
        document.getElementById('htPassword').value,
        document.getElementById('htPrivateKey').value,
        document.getElementById('htOtherPublicKey').value);

    let toBlobPromise = new Promise(function(resolve, reject) {
        imageResult.canvas.toBlob(function(blob) {
            resolve(blob);
        });
    });
    let blob = await toBlobPromise;
    blob.name = getContainerName();

    // Вставляем картинку в форму для отображения пользователю
    let img = document.createElement('img');
    img.style = "max-width: 300px;";
    let imgUrl = URL.createObjectURL(blob);
    
    img.src = imgUrl;
    imageContainerDiv.appendChild(createElementFromHTML('<span>Сохрани изображение ниже и вставь в форму отправки, если оно не вставилось автоматически:</span>'));
    imageContainerDiv.appendChild(document.createElement('br'));
    imageContainerDiv.appendChild(img);

    imageContainerDiv.appendChild(document.createElement('br'));
    imageContainerDiv.appendChild(document.createTextNode(
        `${imageResult.canvas.width}x${imageResult.canvas.height}, ` +
        `скрыто: ${Utils.getHumanReadableSize(imageResult.len)}, ` +
        `заполнено пикселей: ${imageResult.percent}%`));

    let downloadLink  = document.createElement('a');
    downloadLink.innerText = 'Сохранить картинку'
    downloadLink.href = imgUrl;
    downloadLink.download = blob.name;
    imageContainerDiv.appendChild(document.createElement('br'));
    imageContainerDiv.appendChild(downloadLink);

    // Вставляем картинку в форму отправки
    if (isDollchan()) {
        let containers = document.getElementsByClassName('de-hiddencontainer-thumb');
        let containerId = containers.length == 0 ? 0 : parseInt(containers[0].id.split('-').pop()) + 1;
        let inputFileThumbTemplate =
            `<div id="de-hiddencontainer-thumb-${containerId}" class="de-hiddencontainer-thumb" style="display: inline-block;">`+
            `  <div class="de-file">`+
            `    <div class="de-file-img">`+
            `      <div class="de-file-img" title="${blob.name}">`+
            `        <img class="de-file-img" src="${URL.createObjectURL(blob)}">`+
            `      </div>`+
            `    </div>`+
            `  </div>`+
            `<input type="button" onclick="`+
            `document.getElementById('de-hiddencontainer-input-${containerId}').value = null;`+
            `document.getElementById('de-hiddencontainer-input-${containerId}').remove();`+
            `document.getElementById('de-hiddencontainer-thumb-${containerId}').remove();" value="X"/>`+
            `</div>`;
        let inputFileTemplate = `<div style="display: none;"><input id="de-hiddencontainer-input-${containerId}" type="file" name="formimages[]" class="de-file-input" multiple="true" style="display: none;"></div>'`;
        document.getElementsByClassName('postform__raw filer')[0].insertAdjacentHTML("afterbegin", inputFileTemplate);
        let file = new File([blob], blob.name, {type: blob.type});
        let container = new DataTransfer();
        container.items.add(file);
        document.getElementById(`de-hiddencontainer-input-${containerId}`).files = container.files;

        document.getElementById('de-file-area').insertAdjacentHTML("afterbegin", inputFileThumbTemplate);
    }
    else {
        window.FormFiles.addMultiFiles([blob]);
    }

    return {len: imageResult.len, percent: imageResult.percent};
}

const tags = [
    {
        open: '[i]',
        close: '[/i]',
        open_: "<em>",
        close_: "</em>"
    },
    {
        open: '[b]',
        close: '[/b]',
        open_: "<strong>",
        close_: "</strong>"
    },
    {
        open: '[spoiler]',
        close: '[/spoiler]',
        open_: `<span class=\"spoiler\">`,
        close_: "</span>"
    },
    {
        open: '[u]',
        close: '[/u]',
        open_: `<span class=\"u\">`,
        close_: "</span>"
    },
    {
        open: '[o]',
        close: '[/o]',
        open_: `<span class=\"o\">`,
        close_: "</span>"
    },
    {
        open: '[s]',
        close: '[/s]',
        open_: `<span class=\"s\">`,
        close_: "</span>"
    },
    {
        open: '[sup]',
        close: '[/sup]',
        open_: `<sup>`,
        close_: "</sup>"
    },
    {
        open: '[sub]',
        close: '[/sub]',
        open_: `<sub>`,
        close_: "</sub>"
    }
];

function convertToHtml(text) {
    let lines = text.split('\n');
    text = "";
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].length > 2) {
            if (lines[i].trim().startsWith("&gt;")) {
                text += `<span class="unkfunc">${lines[i]}</span><br>`;
                continue;
            }
        }
        text += `${lines[i]}<br>`;
    }
    for (let i = 0; i < text.length; i++) {
        for (let j = 0; j < tags.length; j++) {
            const t = tags[j];
            if (text.substring(i, i + t.open.length).toLowerCase() === t.open) {
                let c = getClosingTagIndex(text, i, t);
                if (c == -1) {
                    continue;
                }
                text = replaceAt(text, i, t.open.length, t.open_);
                text = replaceAt(text, c + (t.open_.length - t.open.length), t.close.length, t.close_);
            }
        }

    }
    return text;
}

function replaceAt(text, index, length, replacement) {
    return text.substr(0, index) + replacement + text.substr(index + length);
}

function getClosingTagIndex(text, i, tag) {
    i += tag.open.length;
    let skip = 0;
    for (; i < text.length; i++) {
        if (text.substring(i, i + tag.open.length).toLowerCase() === tag.open) {
            skip += 1;
            continue;
        }

        if (text.substring(i, i + tag.close.length).toLowerCase() === tag.close) {
            skip -= 1;
            if (skip == -1) {
                return i;
            }
        }
    }
    return -1;
}

// Добавление HTML скрытопоста к основному посту
function addHiddenPostToHtml(postId, loadedPost, unpackedData) {
    Utils.trace(`HiddenThread: Post ${postId} is hidden, its object:`);
    Utils.trace(loadedPost);
    Utils.trace(unpackedData);

    let clearPost = document.getElementById('post-' + postId);
    let postBodyDiv = document.createElement('div');
    postBodyDiv.id = 'hidden_post-body-' + postId;
    postBodyDiv.classList.add("post");
    postBodyDiv.classList.add("post_type_reply");
    postBodyDiv.classList.add("post_type_hiddenthread");
    postBodyDiv.setAttribute('data-num', String(postId));

    let postMetadata = document.createElement('div');
    postMetadata.style = 'font-family: courier new;';
    let postArticle = document.createElement('article');
    postArticle.id = 'hidden_m' + postId;
    postArticle.classList.add("post__message");

    let postArticleMessage = document.createElement('div');
    postArticleMessage.innerHTML = convertToHtml(unpackedData.message);

    let tzOffset = (new Date()).getTimezoneOffset() * 60;
    let timeString = (new Date((loadedPost.timestamp - tzOffset) * 1000))
        .toISOString().replace('T', ' ').replace(/\.\d+Z/g, '');
    let d = clearPost.getElementsByClassName('post__time')[0].textContent.split(' ');
    let postDateMs = Date.parse(`20${d[0].split('/')[2]}-${d[0].split('/')[1]}-${d[0].split('/')[0]}T${d[2]}Z`);
    if (Math.abs(postDateMs/1000 - loadedPost.timestamp) > 24*3600) {
        timeString += ' <span style="color:red;">(неверное время поста!)</span>';
    }
    let tzName = (new Date()).toLocaleDateString(undefined, { timeZoneName: 'short' }).split(',')[1].trim();
    postMetadata.appendChild(createElementFromHTML(`<div>Дата создания скрытопоста (${tzName}): ${timeString}</div>`));
    if (loadedPost.password)
        postMetadata.appendChild(createElementFromHTML(`<div>Пароль: ${passwordAliases[loadedPost.password]} (`+
            `<input id="test" readonly="" `+
            `style="color:var(--theme_default_text);background-color:rgba(0, 0, 0, 0);border:0px;width:9ch;" value="раскрыть" `+
            `onclick="this.value='${loadedPost.password}';this.style.width='${loadedPost.password.length+1}ch'">)</div>`));
    if (loadedPost.isPrivate) {
        postMetadata.appendChild(createElementFromHTML(
            `<div style="color:orange;"><i>Этот пост виден только с твоим приватным ключом `+
            `(${privateKeyAliases[loadedPost.privateKey]})</i></div>`));
    }

    if (loadedPost.publicKey) {
        let postArticleSign = document.createElement('div');
        let publicKeyAlias = otherPublicKeyAliases[loadedPost.publicKey];
        postArticleSign.innerHTML =
            `${publicKeyAlias ? 'Отправитель' : 'Публичный ключ'}: <span style="word-wrap:normal;word-break:normal;color:` +
            `${loadedPost.isVerified ? 'green' : 'red'};">` +
            `${publicKeyAlias ? publicKeyAlias : loadedPost.publicKey}</span>` +
            `${loadedPost.isVerified ? '' : ' (неверная подпись!)'}`;
        postMetadata.appendChild(postArticleSign);
    }

    postMetadata.appendChild(Post.createFileLinksDiv(unpackedData.files,
        unpackedData.hasSkippedFiles, postId, !storage.isPreviewDisabled));
    postArticle.appendChild(postMetadata);

    if (unpackedData.unpackResult) {
        postArticle.appendChild(createElementFromHTML(
            `<div style="font-family:courier new;color:red;">${unpackedData.unpackResult}</div>`));
    }
    postArticle.appendChild(document.createElement('br'));
    postArticle.appendChild(postArticleMessage);

    postBodyDiv.appendChild(postArticle);

    clearPost.appendChild(document.createElement('br'));
    clearPost.appendChild(postBodyDiv);

    // Переносим ссылки на скрытопосты в тело скрытопоста, если они ещё не там
    let normalPostBody = document.getElementById(`post-${postId}`);
    let hiddenPostsRefmap = normalPostBody.querySelector(`#ht_refmap-${postId}`);
    if (hiddenPostsRefmap) {
        document.getElementById(`hidden_m${postId}`).insertAdjacentElement('afterend', hiddenPostsRefmap);
    }
}


// Добавление HTML скрытопоста в объект основного поста (для всплывающих постов)
function addHiddenPostToObj(postId) {
    let thread = window.Post(window.thread.id);
    let currentPost = thread.getPostsObj()[String(postId)];
    let postArticle = document.getElementById('hidden_m' + postId);
    currentPost.ajax.comment = currentPost.ajax.comment + '<br>' + postArticle.innerHTML;
}

// Ссылка на пост в тексте
function createReplyLink(postId) {
    return `<a href="/${window.board}/res/${window.thread.id}.html#${postId}" ` +
        `class="${isDollchan() ? 'de-link-postref' : ''} post-reply-link" ` +
        `data-thread="${window.thread.id}" data-num="${postId}">&gt;&gt;${postId}</a>`;
}

// Ссылка на пост в ответах
function createPostRefLink(postId) {
    if (isDollchan()) {
        return `<a href="#${postId}" class="de-link-backref">&gt;&gt;${postId}</a><span class="de-refcomma">, </span>`;
    }
    else {
        return createReplyLink(postId);
    }
}

function addReplyLinks(postId, refPostIdList) {
    let thread = window.Post(window.thread.id);

    let refPostIdSet = new Set();
    for (const refPostId of refPostIdList) {
        let postEl = document.getElementById(`post-${refPostId}`);
        if (!postEl) continue;

        let hiddenPostsRefmap = document.getElementById(`ht_refmap-${refPostId}`);
        // Если списка с ответами на скрытопосты ещё не существует, создаём его и помещаем
        // в тело скрытопоста (либо в тело обычного поста, если скрытопост ещё не создан)
        if (!hiddenPostsRefmap) {
            if (isDollchan()) {
                hiddenPostsRefmap = createElementFromHTML(`<div id="ht_refmap-${refPostId}" class="de-refmap"></div>`);
            }
            else {
                hiddenPostsRefmap = createElementFromHTML(`<div id="ht_refmap-${refPostId}" class="post__refmap" style="display: block;"></div>`);
            }

            let hiddenPostEl = document.getElementById(`hidden_post-body-${refPostId}`);
            if (!hiddenPostEl) {
                document.getElementById(`m${refPostId}`).insertAdjacentElement('afterend', hiddenPostsRefmap);
            }
            else {
                document.getElementById(`hidden_m${refPostId}`).insertAdjacentElement('afterend', hiddenPostsRefmap);
            }
        }

        if (!refPostIdSet.has(refPostId)) {
            refPostIdSet.add(refPostId);
            // Добавление ссылки на текущий пост в ответы другого поста
            // В HTML:
            hiddenPostsRefmap.appendChild(createElementFromHTML(createPostRefLink(postId)));

            // В Object (для всплывающих постов):
            let refPost = thread.getPostsObj() && thread.getPostsObj()[refPostId];
            if (refPost) {
                if (!refPost.replies) {
                    refPost.replies = new Array();
                }
                if (!(postId in refPost.replies)) refPost.replies.push(postId);
            }
        }
    }
}

function parseMessage(message)
{
    message = message
         .replace(/&/g, "&amp;")
         .replace(/</g, "&lt;")
         .replace(/>/g, "&gt;")
         .replace(/"/g, "&quot;")
         .replace(/'/g, "&#039;");

    let refPostIdList = [];

    message = message.replaceAll(new RegExp('&gt;&gt;(\\d{1,10})', 'g'),
        function(m, s) {
            refPostIdList.push(s);
            return createReplyLink(s);
        });

    return {
        'message': message,
        'refPostIdList': refPostIdList
    }
};

function renderHiddenPost(postId, loadedPost, unpackedData) {
    let res = parseMessage(unpackedData.message);
    unpackedData.message = res.message;
    addHiddenPostToHtml(postId, loadedPost, unpackedData);
    addReplyLinks(postId, res.refPostIdList);
    // TODO: отображение скрытопостов во всплывающих постах с куклоскриптом
    addHiddenPostToObj(postId); // Текст скрытопоста берется из HTML
}


async function loadAndRenderPost(postId, url, passwords, privateKeys) {
    let response = await fetch(url);
    if (!response.ok) throw new Error(`fetch not ok, url: ${url}`);
    let imgArrayBuffer = await response.arrayBuffer();

    let imgId = getImgName(url);
    document.getElementById("imagesLoadedCount").textContent =
        parseInt(document.getElementById("imagesLoadedCount").textContent) + 1;

    let loadedPost = await Post.loadPostFromImage(imgArrayBuffer, passwords, privateKeys);

    if (!loadedPost)
        return loadedPost;

    loadedPosts.add(imgId);
    document.getElementById("hiddenPostsLoadedCount").textContent = loadedPosts.size;

    let unpackedData = await Post.unzipPostData(loadedPost.zipData);
    renderHiddenPost(postId, loadedPost, unpackedData);

    return loadedPost;
}

/*
Проверяет есть ли в этом посте скрытый пост, расшифровывает
и выводит результат
*/
async function loadPost(postId, url, passwords, privateKeys, passwordHashes, privateKeyHashes) {
    Utils.trace('HiddenThread: loading post ' + postId + ' ' + url);

    let imgId = getImgName(url);
    let cachedPost = null;
    try {
        cachedPost = await HtCache.getCachedPost(imgId);
    } catch (e) {}

    if (cachedPost) {
        // Если в кэше не скрытопост и в кэше нет хотя бы одного текущего пароля или ключа,
        // то загружаем пост, выводим его (если удалось декодировать), обновляем кэш
        if (!cachedPost.hiddenPost && (
            passwordHashes.filter(x => !cachedPost.wrongPasswordHashes.includes(x)).length > 0 ||
            privateKeyHashes.filter(x => !cachedPost.wrongPrivateKeyHashes.includes(x)).length > 0 ))
        {
            let loadedPost = await loadAndRenderPost(postId, url, passwords, privateKeys);
            try {
                if (!storage.maxCachedPostSize || (loadedPost.zipData.size < storage.maxCachedPostSize * 1024))
                    await HtCache.updateCache(imgId, loadedPost, passwordHashes, privateKeyHashes);
            } catch (e) {}
        }
        // Если в кэше скрытопост, выводим его
        else if(cachedPost.hiddenPost) {
            loadedPosts.add(imgId);
            document.getElementById("hiddenPostsLoadedCount").textContent = loadedPosts.size;
            document.getElementById("hiddenPostsCachedCount").textContent =
                parseInt(document.getElementById("hiddenPostsCachedCount").textContent) + 1;
            document.getElementById("imagesLoadedCount").textContent =
                parseInt(document.getElementById("imagesLoadedCount").textContent) + 1;

            let unpackedPost = await Post.unzipPostData(cachedPost.hiddenPost.zipData);
            renderHiddenPost(postId, cachedPost.hiddenPost, unpackedPost);
        }
        // В кэше не скрытопост
        else {
            document.getElementById("imagesLoadedCount").textContent =
                parseInt(document.getElementById("imagesLoadedCount").textContent) + 1;
        }
    } else {
        // Если в кэше ничего нет, то загружаем пост,
        // выводим его (если удалось декодировать), обновляем кэш
        let loadedPost = await loadAndRenderPost(postId, url, passwords, privateKeys);
        try {
            if (!storage.maxCachedPostSize || (loadedPost.zipData.size < storage.maxCachedPostSize * 1024))
                await HtCache.updateCache(imgId, loadedPost, passwordHashes, privateKeyHashes);
        } catch (e) {}
    }
}

function CheckVersion() {
    var request = new XMLHttpRequest();
    request.open("GET", VERSION_SOURCE);
    request.onreadystatechange = function () {
        if (request.readyState === 4 && request.status === 200) {
            Utils.trace(`Актуальная версия HiddenThread: ${request.responseText}`);
            let infoDiv = document.getElementById('versionInfo');
            infoDiv.innerHTML = '';
            let info = document.createElement('span');
            if (CURRENT_VERSION === request.responseText) {
                info.style = 'color: green';
                info.textContent = 'У вас актуальная версия скрипта';
            } else {
                info.style = 'color: red';
                info.textContent = 'Ваша версия скрипта устарела';
                infoDiv.insertAdjacentHTML('afterbegin', `(<a href="${SCRIPT_SOURCE}">обновить</a>)`);
            }
            infoDiv.insertAdjacentElement('afterbegin', info);
        }
    };
    request.send(null); // Send the request now
}

function addItemsToSelect(items, selectId) {
    for (let item of items) {
        let option = document.createElement('option');
        let str = `${item.alias} (${item.value})`;
        let shortStr = str.substring(0, 20);
        option.textContent = shortStr + ((str.length != shortStr.length) ? '...' : '');
        document.getElementById(selectId).add(option);
    }
}

function createManager(managerType) {
    let header1 = null;
    let items = null;

    // Обновляем пароли/ключи из хранилища
    if (managerType == 'Password') {
        passwords = storage.passwords ? storage.passwords : [];
        items = passwords;
        header1 = '<th style="width:250px">Пароль</th>';
    } else if (managerType == 'PrivateKey') {
        privateKeys = storage.privateKeys ? storage.privateKeys : [];
        items = privateKeys;
        header1 = '<th style="width:250px">Приватный ключ</th>';
    } else {
        otherPublicKeys = storage.otherPublicKeys ? storage.otherPublicKeys : [];
        items = otherPublicKeys;
        header1 = '<th style="width:250px">Публичный ключ</th>';
    }

    function createRow(index, item) {
        let tr = document.createElement('tr');
        tr.id = `ht${managerType}ManagerRow_${index}`;
        let tdAlias = document.createElement('td');
        let inputAlias = document.createElement('input');
        inputAlias.style.width = '100%';
        inputAlias.value = item.alias;
        inputAlias.placeholder = 'Введите имя';
        tdAlias.appendChild(inputAlias);
        tr.appendChild(tdAlias);

        let tdValue = document.createElement('td');
        let inputValue = document.createElement('input');
        inputValue.style.width = '100%';
        inputValue.value = item.value;
        inputValue.placeholder = `Вставьте ${managerType == 'Password' ? 'пароль' :
            (managerType == 'PrivateKey' ? 'приватный ключ' : 'публичный ключ')}`;
        tdValue.appendChild(inputValue);
        tr.appendChild(tdValue);

        let tdDelete = document.createElement('td');
        let inputDelete = document.createElement('input');
        inputDelete.type = 'button';
        inputDelete.value = "Удалить";
        inputDelete.onclick = function () {
            document.getElementById(`ht${managerType}ManagerRow_${index}`).remove();
        }
        tdDelete.appendChild(inputDelete);
        tr.appendChild(tdDelete);
        return tr;
    }

    let tableHtml = `
        <table border="1"><tbody id="ht${managerType}ManagerBody">
        <tr><th style="width:100px">Имя</th>${header1}<th></th></tr></tbody></table>`;
    document.getElementById(`ht${managerType}ManagerDiv`).insertAdjacentHTML('afterbegin', tableHtml);

    let i = 0;
    for (let item of items) {
        document.getElementById(`ht${managerType}ManagerBody`).appendChild(createRow(i, item));
        i++;
    }

    let buttonsDiv = document.createElement('div');
    buttonsDiv.align = 'center';

    let addButton = document.createElement('input');
    addButton.type = 'button';
    addButton.value = 'Добавить';
    addButton.style = 'padding:5px;margin:auto';
    addButton.onclick = function() {
        let rows = document.getElementById(`ht${managerType}ManagerBody`).getElementsByTagName('tr');
        let lastIndex = 0;
        if (rows.length > 1) {
            lastIndex = parseInt(rows[rows.length - 1].id.split('_')[1]) + 1;
        }
        document.getElementById(`ht${managerType}ManagerBody`).appendChild(createRow(lastIndex, {alias:'', value:''}));
    }

    let saveButton = document.createElement('input');
    saveButton.type = 'button';
    saveButton.value = 'Сохранить';
    saveButton.style = 'padding:5px;margin:auto';
    saveButton.onclick = function() {
        let newItems = [];
        let rows = document.getElementById(`ht${managerType}ManagerBody`).getElementsByTagName('tr');
        for (let row of rows) {
            let inputs = row.getElementsByTagName('input');
            if (inputs.length < 2) continue;
            newItems.push({alias: inputs[0].value, value: inputs[1].value});
        }

        // Обновляем хранилище и переменные
        if (managerType == 'Password') {
            setStorage({ passwords: newItems });
            passwords = newItems;
            passwordAliases = {};
            for (let password of passwords) {
                passwordAliases[password.value] = password.alias;
            }
        } else if (managerType == 'PrivateKey') {
            setStorage({ privateKeys: newItems });
            privateKeys = newItems;
            privateKeyAliases = {};
            for (let privateKey of privateKeys) {
                privateKeyAliases[privateKey.value] = privateKey.alias;
            }
        } else {
            setStorage({ otherPublicKeys: newItems });
            otherPublicKeys = newItems;
            otherPublicKeyAliases = {};
            for (let otherPublicKey of otherPublicKeys) {
                otherPublicKeyAliases[otherPublicKey.value] = otherPublicKey.alias;
            }
        }
        items = newItems;

        // Обновляем элементы в выпадающем списке и в форме ввода
        if (document.getElementById(`ht${managerType}Select`).selectedIndex > 1) {
            document.getElementById(`ht${managerType}Select`).prevIndex = 0;
            document.getElementById(`ht${managerType}Select`).selectedIndex = 0;
            document.getElementById(`ht${managerType}InputDiv`).style.display = 'none';
            document.getElementById(`ht${managerType}`).value = '';
            if (managerType == 'PrivateKey') {
                document.getElementById(`htPublicKey`).value = '';
                document.getElementById(`htPrivatePhrase`).value = '';
            }
        }
        let selectOptions = document.getElementById(`ht${managerType}Select`).getElementsByTagName('option');
        for (let i = selectOptions.length - 1; i > 1; i--) {
            selectOptions[i].remove();
        }
        addItemsToSelect(items, `ht${managerType}Select`);

        document.getElementById(`ht${managerType}ManagerDiv`).innerHTML = '';
    }

    buttonsDiv.appendChild(addButton);
    buttonsDiv.appendChild(saveButton);
    document.getElementById(`ht${managerType}ManagerDiv`).appendChild(buttonsDiv);
}

function privateToPublicKey(privateKey) {
    let publicKeyArray = null;
    try {
        publicKeyArray = Crypto.importPublicKeyArrayFromPrivateKey(privateKey);
    }
    catch (e) { }
    if (publicKeyArray && publicKeyArray.length > 0) {
        return Utils.arrayToBase58(publicKeyArray);
    }
    return '';
}

function createInterface() {
    let toggleText = () => {
        return storage.hidePostForm
            ? "Открыть"
            : "Закрыть"
    }
    let formTemplate = `
        <br>
        <div id="hiddenPostDiv" style="display: inline-block; text-align: left; ${isDollchan()?'min-width: 600px;':'width: 100%;'}">
            <hr>
            <div style="position: relative; display: flex; justify-content: center; align-items: center">
                <p style="font-size:x-large;">Скрытотред ${CURRENT_VERSION}
                    <a target="_blank" style="font-size: small; margin-left: 5px" href="https://github.com/anon25519/hiddenthread">?</a>
                </p>
                <span id="hiddenThreadToggle" style="position: absolute; right: 0; cursor: pointer">${toggleText()}</span>
            </div>
            <div id="hiddenThreadForm" style="display: ${storage.hidePostForm ? 'none' : ''}">
                <div style="padding:5px;">
                    <input id="htClearFormButton" type="button" style="padding:5px;margin:auto;display:block;color:red" value="Очистить форму" />
                </div>
                <div style="padding:5px;text-align:center;">
                    <!--<span id="loadingStatus" style="display: none">Загрузка...</span>-->
                    Загружено картинок: <span id="imagesLoadedCount">0</span>/<span id="imagesCount">0</span>
                    <br>
                    Загружено скрытопостов: <span id="hiddenPostsLoadedCount">0</span>
                    (из кэша: <span id="hiddenPostsCachedCount">0</span>)
                </div>
                <textarea
                    id="hiddenPostInput"
                    placeholder="Пиши скрытый текст тут. Максимальная длина ${Post.MESSAGE_MAX_LENGTH}"
                    style="box-sizing: border-box; display: inline-block; width: 100%; padding: 5px;"
                    rows="10"
                ></textarea>
                <div id="hiddenFilesDiv" style="padding: 5px;">
                    <span>Выбери скрытые файлы: </span>
                    <input id="hiddenFilesInput" type="file" multiple="true" />
                    <br>
                    <input id="hiddenFilesClearButton" class="mt-1" type="button" value="Очистить список файлов" />
                </div>

                <div style="padding: 5px;">
                    <div style="font-size:large;text-align:center;">Настройки шифрования</div>
                    <div style="padding: 5px;">
                        <span style="padding-right: 5px;">Пароль:</span>
                        <div class="selectbox"><select id="htPasswordSelect" class="input select" style="max-width:25ch">
                            <option>Без пароля</option>
                            <option>Ввести вручную</option>
                        </select></div>
                        <input id="htPasswordManagerButton" type="button" value="Менеджер паролей" />
                        <div id="htPasswordManagerDiv" align="center" style="padding-top:5px;"></div>
                        <div id="htPasswordInputDiv" style="display:none;padding-top:5px;">
                            <input id="htPassword" placeholder="Без пароля" autocomplete="off" style="max-width:64ch;width:100%" />
                        </div>
                    </div>
                    <div style="padding: 5px;">
                        <span style="padding-right: 5px;">Подпись:</span>
                        <div class="selectbox"><select id="htPrivateKeySelect" class="input select" style="max-width:25ch">
                            <option>Без ключа</option>
                            <option>Ввести вручную</option>
                        </select></div>
                        <input id="htPrivateKeyManagerButton" type="button" value="Менеджер ключей" />
                        <div id="htPrivateKeyManagerDiv" align="center" style="padding-top:5px;"></div>
                        <div id="htPrivateKeyInputDiv" style="display:none;padding-top:5px;">
                            <div id="htPrivatePhraseInputDiv">
                                Секретная фраза для генерации ключа: <br>
                                <input id="htPrivatePhrase" placeholder="Без секретной фразы" autocomplete="off" style="max-width:50ch;width:100%;padding-top:5px;" /><br>
                            </div>
                            Приватный ключ (ECDSA p256, base58): <br>
                            <input id="htPrivateKey" placeholder="Без ключа" autocomplete="off" style="max-width:50ch;width:100%;padding-top:5px;" /><br>
                            Публичный ключ: <br>
                            <input id="htPublicKey" autocomplete="off" readonly style="max-width:90ch;width:100%;color:grey;padding-top:5px;" />
                            <div align="center" class="mt-1">
                                <input id="generateKeyPairButton" type="button" value="Сгенерировать ключи" />
                            </div>
                        </div>
                    </div>
                    <div style="padding: 5px;">
                        <span style="padding-right: 5px;">Получатель:</span>
                        <div class="selectbox"><select id="htOtherPublicKeySelect" class="input select" style="max-width:25ch">
                            <option>Все</option>
                            <option>Ввести вручную</option>
                        </select></div>
                        <input id="htOtherPublicKeyManagerButton" type="button" value="Адресная книга" />
                        <div id="htOtherPublicKeyManagerDiv" align="center" style="padding-top:5px;"></div>
                        <div id="htOtherPublicKeyInputDiv" style="display:none;padding-top:5px;">
                            Публичный ключ получателя: <br>
                            <input id="htOtherPublicKey" placeholder="Без получателя" autocomplete="off" style="max-width:90ch;width:100%" />
                        </div>
                    </div>
                </div>

                <div style="padding: 5px;">
                    <div style="font-size:large;text-align:center;">Настройки контейнера</div>
                    <div>
                        <span style="margin-right: 5px">Картинка:</span>
                        <div class="selectbox">
                        <select id="htContainerTypeSelect" class="input select" style="max-width:25ch">
                            <option>загрузить случайную</option>
                            <option>выбрать свою</option>
                            <option>сгенерировать</option>
                        </select>
                        </div>
                        <div id="htContainerInputDiv">
                            <span>Выбери файл(ы) (из нескольких берется рандомный): </span>
                            <input id="hiddenContainerInput" type="file" multiple="true" />
                            <br><br>
                        </div>
                    </div>
                    <div>
                        <span style="margin-right: 5px">Имя картинки:</span>
                        <div class="selectbox">
                        <select id="htContainerNameSelect" class="input select" style="max-width:15ch">
                            <option>image.png</option>
                            <option>unixtime</option>
                        </select>
                        </div>
                        <input id="htContainerName" autocomplete="off">
                    </div>
                    <div>Подстраивать разрешение картинки под размер поста: <input id="isDataRatioLimited" type="checkbox"></div>
                    <div id="maxDataRatioDiv" style="display:none">
                    <div>Точное соответствие (картинка может быть уменьшена): <input id="isDownscaleAllowed" type="checkbox"></div>
                    <div>Процент заполнения контейнера данными: <input type="number" id="maxDataRatio" min="1" max="100" value="20" style="width:70px"></div>
                    </div>
                </div>
                <br>
                <div align="center">
                    <input id="createHiddenPostButton" type="button" value="Создать картинку со скрытопостом" style="padding: 5px;">
                </div>
                <div id="imageContainerDiv" align="center" />
            </div>
            <div id="versionInfo" style="display: flex; justify-content: center;"></div>
            <hr>
        </div>
    `
    let style = document.createElement("style")
    let css = `
        #hiddenPostDiv .mt-1 { margin-top: 1em; }
        #hiddenPostDiv input, textarea {
            border: 1px solid var(--theme_default_btnborder);
            background: var(--theme_default_altbtnbg);
            color: var(--theme_default_btntext);
        }
        #hiddenPostDiv input[type=button] {
            color: var(--theme_default_btntext);
        }
        .post_type_hiddenthread {
            border-left: 3px solid #${storage.postsColor ? storage.postsColor : 'F00000'};
            border-right: 3px solid #${storage.postsColor ? storage.postsColor : 'F00000'};
        }
    `
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style)

    // render
    document.getElementById('postform').insertAdjacentHTML(isDollchan() ? 'afterend' : 'beforeend', formTemplate);

    // Меню
    document.getElementsByClassName('adminbar__boards')[0].insertAdjacentHTML(
        'beforeend', `
        <span>&nbsp;&nbsp;&nbsp;&nbsp;HiddenThread:
        <a id="hideNormalPosts" href="#">Свернуть/развернуть все обычные посты</a>
        | <a id="hiddenThreadSettings" href="#">Настройки</a>
        <div id="hiddenThreadSettingsWindow" style="display: none; border: solid 1px black; padding: 2px; text-align: left; min-width: 370px; max-width: fit-content; margin: auto;">
            <div>Настройки</div>
            <hr>
            <div>
                <div><input id="htIsDebugLogEnabled" type="checkbox"> <span>Включить debug-лог</span></div>
                <div><input id="htIsQueueLoadEnabled" type="checkbox"> <span>Включить последовательную загрузку скрытопостов</span></div>
                <div><input id="htIsPreviewDisabled" type="checkbox"> <span>Отключить превью картинок в скрытопостах</span></div>
                <div><input id="htIsFormClearEnabled" type="checkbox"> <span>Включить очистку полей при создании картинки</span></div>
                <div><input id="htPostsColor" maxlength="6" size="6"> <span>Цвет выделения скрытопостов (в hex)</span></div>
                <div><input id="htMaxCachedPostSize" type="number" min="0" step="1" size="12"> <span>Макс. размер поста в кэше, Кб (0 - без лимита)</span></div>
                <div><input id="htMaxCacheSize" type="number" min="0" step="1" size="12"> <span>Макс. размер кэша, Мб (0 - кэш выключен)</span></div>
                <div>Текущий размер кэша: <span id="htCacheSize">???</span></div>
                <div><button id="htClearCache">Очистить кэш</button></div>
            </div>
            <hr>
            <div>
                <input type="button" class="button" id="hiddenThreadSettingsSave" value="Сохранить">
                <input type="button" class="button" id="hiddenThreadSettingsCancel" value="Отмена">
                <br><i>Для применения обновите страницу</i>
            </div>
        </div>
        </span>`);
    let hiddenThreadSettingsLink = document.getElementById('hiddenThreadSettings');
    hiddenThreadSettingsLink.onclick = function() {
        let settingsWindow = document.getElementById('hiddenThreadSettingsWindow');
        document.getElementById("htIsDebugLogEnabled").checked = storage.isDebugLogEnabled;
        document.getElementById("htIsQueueLoadEnabled").checked = storage.isQueueLoadEnabled;
        document.getElementById("htIsPreviewDisabled").checked = storage.isPreviewDisabled;
        document.getElementById("htIsFormClearEnabled").checked = storage.isFormClearEnabled;
        document.getElementById("htPostsColor").value = storage.postsColor ? storage.postsColor : 'F00000';
        document.getElementById("htMaxCachedPostSize").value = storage.maxCachedPostSize ? storage.maxCachedPostSize : 0;
        document.getElementById("htMaxCacheSize").value = storage.maxCacheSize ? storage.maxCacheSize : 0;
        settingsWindow.style.display = settingsWindow.style.display == 'none' ? 'block' : 'none';
    }
    document.getElementById("hiddenThreadSettingsCancel").onclick = function() {
        document.getElementById('hiddenThreadSettingsWindow').style.display = 'none';
    }
    document.getElementById("hiddenThreadSettingsSave").onclick = function() {
        setStorage({ isDebugLogEnabled: document.getElementById("htIsDebugLogEnabled").checked });
        setStorage({ isQueueLoadEnabled: document.getElementById("htIsQueueLoadEnabled").checked });
        setStorage({ isPreviewDisabled: document.getElementById("htIsPreviewDisabled").checked });
        setStorage({ isFormClearEnabled: document.getElementById("htIsFormClearEnabled").checked });
        setStorage({ postsColor: document.getElementById("htPostsColor").value });
        let maxCachedPostSize = parseInt(document.getElementById("htMaxCachedPostSize").value);
        setStorage({ maxCachedPostSize: maxCachedPostSize ? maxCachedPostSize : 0 });
        let maxCacheSize = parseInt(document.getElementById("htMaxCacheSize").value);
        setStorage({ maxCacheSize: maxCacheSize ? maxCacheSize : 0 });
        document.getElementById('hiddenThreadSettingsWindow').style.display = 'none';
    }
    let clearCacheButton = document.getElementById("htClearCache");
    clearCacheButton.onclick = async function() {
        let oldText = clearCacheButton.textContent;
        clearCacheButton.textContent = 'Очищаем...';
        clearCacheButton.disabled = true;
        try {
            await HtCache.clearStore();
            alert('Кэш очищен');
        } catch (e) {
            alert('Не удалось очистить кэш: ' + e);
        }
        clearCacheButton.textContent = oldText;
        clearCacheButton.disabled = false;
    }

    // listeners
    let enlargeCheck = document.getElementById('isDataRatioLimited')
    enlargeCheck.onchange = function () {
        document.getElementById('maxDataRatioDiv').style = `display:${enlargeCheck.checked ? 'block' : 'none'}`;
    }

    let hideEl = document.getElementById('hideNormalPosts');
    hideEl.onclick = function () {
        hidePosts(watchedPosts);
        hideEl.value = !hideEl.value;
    }
    hideEl.value = false;

    let toggleEl = document.getElementById("hiddenThreadToggle")
    toggleEl.onclick = () => {
        setStorage({ hidePostForm: !storage.hidePostForm })
        toggleEl.textContent = toggleText()
        let formEl = document.getElementById("hiddenThreadForm")
        formEl.style.display = storage.hidePostForm
            ? "none"
            : ""
    }

    document.getElementById('htContainerNameSelect').onclick = function () {
        document.getElementById('htContainerName').value = '';
        if (this.selectedIndex == 0) {
            document.getElementById('htContainerName').placeholder = 'image.png';
        } else {
            document.getElementById('htContainerName').placeholder =
                `${Utils.getRandomInRange(14000000000000, Date.now()*10)}.png`;
        }
        setStorage({ containerName: this.selectedIndex });
    }
    document.getElementById('htContainerNameSelect').selectedIndex = storage.containerName ? storage.containerName : 0;
    document.getElementById('htContainerNameSelect').click();

    document.getElementById('htContainerTypeSelect').onclick = function () {
        document.getElementById('htContainerInputDiv').style.display = (this.selectedIndex == 1) ?
            'block' : 'none';
        setStorage({ containerType: this.selectedIndex });
    }
    document.getElementById('htContainerTypeSelect').selectedIndex = storage.containerType ? storage.containerType : 0;
    document.getElementById('htContainerTypeSelect').click();

    document.getElementById('htClearFormButton').onclick = function () {
        document.getElementById('hiddenPostInput').value = '';
        document.getElementById('hiddenFilesInput').value = null;
        let dollchanThumbs = document.getElementsByClassName('de-hiddencontainer-thumb');
        let containerIdList = [];
        for (let thumb of dollchanThumbs) {
            containerIdList.push(thumb.id.split('-').pop());
        }
        for (let id of containerIdList) {
            document.getElementById(`de-hiddencontainer-input-${id}`).value = null;
            document.getElementById(`de-hiddencontainer-input-${id}`).remove();
            document.getElementById(`de-hiddencontainer-thumb-${id}`).remove();
        }
    }

    document.getElementById('hiddenFilesClearButton').onclick = function () {
        document.getElementById('hiddenFilesInput').value = null;
    }

    let createHiddenPostButton = document.getElementById('createHiddenPostButton');
    createHiddenPostButton.onclick = async function () {
        let oldText = createHiddenPostButton.value;
        createHiddenPostButton.value = 'Генерируем картинку...';
        createHiddenPostButton.disabled = true;
        try {
            let res = await createHiddenPost();
            if (res) {
                alert('Спрятано ' + res.len + ' байт (занято ' + res.percent + '% изображения)');
                if (storage.isFormClearEnabled) {
                    document.getElementById('hiddenPostInput').value = '';
                    document.getElementById('hiddenFilesInput').value = null;
                }
                // Сбрасываем название картинки, чтобы оно не повторялось
                document.getElementById('htContainerNameSelect').click();
            }
        } catch (e) {
            Utils.trace('HiddenThread: Ошибка при создании скрытопоста: ' + e + ' stack:\n' + e.stack);
            alert('Ошибка при создании скрытопоста: ' + e);
        }
        createHiddenPostButton.value = oldText;
        createHiddenPostButton.disabled = false;
    }


    // Обработчики элементов в настройках шифрования
    document.getElementById('htPasswordSelect').prevIndex = -1;
    document.getElementById('htPasswordSelect').onclick = function (e) {
        if (this.selectedIndex == this.prevIndex) return;
        if (this.selectedIndex == 0) {
            document.getElementById('htPasswordInputDiv').style.display = 'none';
            document.getElementById('htPassword').value = '';
        } else if (this.selectedIndex == 1) {
            document.getElementById('htPasswordInputDiv').style.display = 'block';
            document.getElementById('htPassword').style.color = '';
            document.getElementById('htPassword').readOnly = false;
            document.getElementById('htPassword').value = '';
        } else {
            document.getElementById('htPasswordInputDiv').style.display = 'block';
            document.getElementById('htPassword').style.color = 'grey';
            document.getElementById('htPassword').readOnly = true;
            document.getElementById('htPassword').value = passwords[this.selectedIndex - 2].value;
        }
        this.prevIndex = this.selectedIndex;
    }
    document.getElementById('htPrivateKeySelect').prevIndex = -1;
    document.getElementById('htPrivateKeySelect').onclick = function (e) {
        if (this.selectedIndex == this.prevIndex) return;
        if (this.selectedIndex == 0) {
            document.getElementById('htPrivateKeyInputDiv').style.display = 'none';
            document.getElementById('htPrivateKey').value = '';
            document.getElementById('htPublicKey').value = '';
            document.getElementById('htPrivatePhrase').value = '';
        } else if (this.selectedIndex == 1) {
            document.getElementById('htPrivateKeyInputDiv').style.display = 'block';
            document.getElementById('htPrivatePhraseInputDiv').style.display = 'block';
            document.getElementById('htPrivateKey').style.color = '';
            document.getElementById('htPrivateKey').readOnly = false;
            document.getElementById('htPrivateKey').value = '';
            document.getElementById('htPublicKey').value = '';
            document.getElementById('htPrivatePhrase').value = '';
            document.getElementById('generateKeyPairButton').style.display = '';
        } else {
            document.getElementById('htPrivateKeyInputDiv').style.display = 'block';
            document.getElementById('htPrivatePhraseInputDiv').style.display = 'none';
            document.getElementById('htPrivateKey').style.color = 'grey';
            document.getElementById('htPrivateKey').readOnly = true;
            document.getElementById('htPrivateKey').value = privateKeys[this.selectedIndex - 2].value;
            document.getElementById('htPublicKey').value = privateToPublicKey(privateKeys[this.selectedIndex - 2].value);
            document.getElementById('htPrivatePhrase').value = '';
            document.getElementById('generateKeyPairButton').style.display = 'none';
        }
        this.prevIndex = this.selectedIndex;
    }
    document.getElementById('htOtherPublicKeySelect').onclick = function (e) {
        if (this.selectedIndex == this.prevIndex) return;
        if (this.selectedIndex == 0) {
            document.getElementById('htOtherPublicKeyInputDiv').style.display = 'none';
            document.getElementById('htOtherPublicKey').value = '';
        } else if (this.selectedIndex == 1) {
            document.getElementById('htOtherPublicKeyInputDiv').style.display = 'block';
            document.getElementById('htOtherPublicKey').style.color = '';
            document.getElementById('htOtherPublicKey').readOnly = false;
            document.getElementById('htOtherPublicKey').value = '';
        } else {
            document.getElementById('htOtherPublicKeyInputDiv').style.display = 'block';
            document.getElementById('htOtherPublicKey').style.color = 'grey';
            document.getElementById('htOtherPublicKey').readOnly = true;
            document.getElementById('htOtherPublicKey').value = otherPublicKeys[this.selectedIndex - 2].value;
        }
        this.prevIndex = this.selectedIndex;
    }

    // Добавляем пароли и ключи в выпадающие списки
    addItemsToSelect(passwords, 'htPasswordSelect');
    addItemsToSelect(privateKeys, 'htPrivateKeySelect');
    addItemsToSelect(otherPublicKeys, 'htOtherPublicKeySelect');

    let generateKeyPairButton = document.getElementById('generateKeyPairButton');
    generateKeyPairButton.onclick = async function () {
        if (!document.getElementById('htPrivateKey').value ||
            confirm('Сгенерировать новую пару ключей? Предыдущая пара будет стерта!'))
        {
            let oldText = generateKeyPairButton.value;
            generateKeyPairButton.value = 'Генерируем ключи...';
            generateKeyPairButton.disabled = true;

            try {
                let pair = await Crypto.generateKeyPair();
                document.getElementById('htPrivatePhrase').value = '';
                document.getElementById('htPrivateKey').value = pair[0];
                document.getElementById('htPublicKey').value = pair[1];
            } catch (e) {
                Utils.trace('HiddenThread: Ошибка при создании ключей: ' + e + ' stack:\n' + e.stack);
                alert('Ошибка при создании ключей: ' + e);
            }

            generateKeyPairButton.value = oldText;
            generateKeyPairButton.disabled = false;
        }
    }

    document.getElementById('htPrivateKey').oninput = function () {
        document.getElementById(`htPrivatePhrase`).value = '';
        document.getElementById('htPublicKey').value =
            privateToPublicKey(document.getElementById('htPrivateKey').value);
    }
    document.getElementById('htPrivatePhrase').oninput = async function () {
        if (document.getElementById('htPrivatePhrase').value) {
            document.getElementById('htPrivateKey').value =
                await Crypto.digestMessageBase58(document.getElementById('htPrivatePhrase').value);
            document.getElementById('htPublicKey').value =
                privateToPublicKey(document.getElementById('htPrivateKey').value);
        } else {
            document.getElementById('htPrivateKey').value = '';
            document.getElementById('htPublicKey').value = '';
        }
    }

    document.getElementById('htPasswordManagerButton').onclick = function() {
        let manager = document.getElementById('htPasswordManagerDiv');
        if (!manager.innerHTML) {
            createManager('Password');
        } else {
            manager.innerHTML = '';
        }
    }
    document.getElementById('htPrivateKeyManagerButton').onclick = function() {
        let manager = document.getElementById('htPrivateKeyManagerDiv');
        if (!manager.innerHTML) {
            createManager('PrivateKey');
        } else {
            manager.innerHTML = '';
        }
    }
    document.getElementById('htOtherPublicKeyManagerButton').onclick = function() {
        let manager = document.getElementById('htOtherPublicKeyManagerDiv');
        if (!manager.innerHTML) {
            createManager('OtherPublicKey');
        } else {
            manager.innerHTML = '';
        }
    }
}

function hidePosts(posts) {
    for (let post of posts) {
        let body = document.getElementById(`post-body-${post}`);
        if (isDollchan()) {
            body.getElementsByClassName('post__message')[0].classList.toggle('de-post-hiddencontent');
            if (body.getElementsByClassName('post__images')[0]) {
                body.getElementsByClassName('post__images')[0].classList.toggle('de-post-hiddencontent');
            }
            let refmaps = body.getElementsByClassName('de-refmap');
            if (refmaps) {
                for (let r of refmaps) {
                    r.classList.toggle('de-post-hiddencontent');
                }
            }
        }
        else {
            body.classList.toggle('post_type_hidden');
        }
    }
}

// Получить посты, которые нужно просмотреть
/*
Возвращает объект:
postsToScan{
    urls: [url1, url2],
    postId: ...
}
*/
function getPostsToScan()
{
    if (isDollchan()) return getPostsToScanFromHtml();

    let threadId = window.thread.id;
    let thread = window.Post(threadId);
    let postsToScan = [];

    let postIdList = null;
    try {
        postIdList = thread.threadPosts();
    }
    catch (e) {
        // Если не удалось получить объект треда, берем id и ссылки из HTML
        return getPostsToScanFromHtml();
    }

    for (let postId of postIdList) {
        let postAjax = thread.getPostsObj()[String(postId)].ajax;
        if (!postAjax) continue;

        let postFiles = postAjax.files;

        let urls = [];
        for (let file of postFiles) {
            if (file.path.endsWith('.png')) {
                urls.push(file.path);
            }
        }
        postsToScan.push({
            urls: urls,
            postId: postId
        });
    }

    return postsToScan;
}

function getPostsToScanFromHtml() {
    let postsToScan = [];
    let posts = document.getElementsByClassName('post');

    for (let post of posts) {
        let postImages = post.getElementsByClassName('post__images');
        let urls = [];
        for (let img of postImages) {
            let urlsHtml = img.getElementsByClassName('post__image-link');
            for (let url of urlsHtml) {
                if (url.href.endsWith('.png')) {
                    urls.push(url.href);
                }
            }
        }
        postsToScan.push({
            urls: urls,
            postId: post.getAttribute('data-num')
        });
    }

    return postsToScan;
}


async function getCacheSizeReadable() {
    try {
        let size = await HtCache.getCacheSize();
        return Utils.getHumanReadableSize(size);
    } catch (e) {}
    return "???";
}

async function getIdbUsageReadable() {
    try {
        const quota = await navigator.storage.estimate();
        return Utils.getHumanReadableSize(quota.usage);
    } catch (e) {}
    return "???";
}

// множество ID просмотренных постов
let watchedPosts = new Set();
// множество ID просмотренных картинок
let watchedImages = new Set();
// множество ID картинок с загруженными скрытопостами
let loadedPosts = new Set();
let scanning = false;
/*
Просмотреть все посты и попробовать расшифровать
*/
async function loadHiddenThread() {
    if (scanning) {
        return; // Чтобы не запускалось в нескольких потоках
    }
    scanning = true;

    let postsToScan = getPostsToScan();

    document.getElementById("imagesCount").textContent = getImagesCount(postsToScan).toString();
    document.getElementById('htCacheSize').textContent = `???+ ${await getCacheSizeReadable()} (IDB usage: ${await getIdbUsageReadable()})`;

    // Добавляем пустой пароль
    let actualPasswords = passwords.concat([{alias:'', value:''}]);

    let passwordHashes = [];
    for (let password of actualPasswords) {
        passwordHashes.push(await Crypto.digestMessageHex(password.value));
    }
    let privateKeyHashes = [];
    for (let privateKey of privateKeys) {
        privateKeyHashes.push(await Crypto.digestMessageHex(privateKey.value));
    }

    let loadPostPromises = [];
    for (let post of postsToScan) {
        for (let url of post.urls) {
            let imgId = getImgName(url);
            if (loadedPosts.has(imgId) || watchedImages.has(imgId)) {
                continue;
            }
            watchedImages.add(imgId);

            function promiseGenerator() {
                return new Promise(async function(resolve, reject) {
                    try {
                        await loadPost(post.postId, url, actualPasswords, privateKeys, passwordHashes, privateKeyHashes);
                    }
                    catch(e) {
                        Utils.trace('HiddenThread: Ошибка при загрузке поста: ' + e + ' stack:\n' + e.stack);
                    }
                    resolve();
                });
            }

            let p = promiseGenerator();
            if(storage.isQueueLoadEnabled) {
                await p;
            } else {
                loadPostPromises.push(p);
            }
        }
        if (!watchedPosts.has(post.postId)) {
            watchedPosts.add(post.postId);
            if (document.getElementById('hideNormalPosts').value) {
                hidePosts([post.postId]);
            }
        }
    }

    await Promise.all(loadPostPromises);

    document.getElementById('htCacheSize').textContent = `${await getCacheSizeReadable()} (IDB usage: ${await getIdbUsageReadable()})`;

    scanning = false;
}

function loadPasswordsAndKeys() {
    passwords = storage.passwords ? storage.passwords : [];
    passwordAliases = {};
    for (let password of passwords) {
        passwordAliases[password.value] = password.alias;
    }

    privateKeys = storage.privateKeys ? storage.privateKeys : [];
    privateKeyAliases = {};
    for (let privateKey of privateKeys) {
        privateKeyAliases[privateKey.value] = privateKey.alias;
    }

    otherPublicKeys = storage.otherPublicKeys ? storage.otherPublicKeys : [];
    otherPublicKeyAliases = {};
    for (let otherPublicKey of otherPublicKeys) {
        otherPublicKeyAliases[otherPublicKey.value] = otherPublicKey.alias;
    }
}

function getImagesCount(postsToScan) {
    let r = 0;
    for (let i = 0; i < postsToScan.length; i++) {
        r += postsToScan[i].urls.length;
    }
    return r;
}

function isDollchan() {
    return document.getElementsByClassName('de-runned').length;
}

function isMakaba() {
    return document.getElementsByClassName('makaba').length
}

// Работаем только на главной и в тредах
if (!isMakaba()) return;

if (!storage.isDebugLogEnabled)
    Utils.trace = function() {}

HtCache.initCacheStorage(storage.maxCacheSize ? storage.maxCacheSize : 0);
loadPasswordsAndKeys();

createInterface();
CheckVersion();

setInterval(loadHiddenThread, 5000);