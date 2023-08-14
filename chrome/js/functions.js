// -----------------------------------------------------------------------------------------
// HTML
// -----------------------------------------------------------------------------------------
function createGalleryIcon(ul, icon, count) {
    const li = createGalleryLi();
    ul.appendChild(li);
    const iconEl = createFaIcon(icon);
    li.appendChild(iconEl);
    const spanEl = createIconSpan();
    li.appendChild(spanEl);
    if (typeof count === 'object') {
        spanEl.appendChild(count);
    } else {
        spanEl.textContent = count;
    }
}

function createGalleryUl() {
    const ul = document.createElement('ul');
    ul.classList.add('art-plus-icons-list', artBlock, 'art-plus-gallery-grid-icons');
    return ul;
}

function createGalleryLi() {
    const li = document.createElement('li');
    return li;
}

function createFaIcon(icon, size='md') {
    const div = document.createElement('div');
    div.classList.add('art-plus-icon', 'art-plus-' + icon, 'art-plus-pad-right', 'art-plus-icon-' + size);
    return div;
}

function createIconSpan() {
    const span = document.createElement('span');
    span.classList.add('ratio-art-ext');
    span.style.fontSize = '12px';
    return span;
}

function createSelectSpan() {
    let selectSpan = document.createElement("span");
    selectSpan.classList.add('select2', 'select2-container', 'select2-container--classic');
    return selectSpan;
}

function createSortSelectEl() {
    let select = document.createElement("select");
    select.id = "sort-select";
    select.classList.add('select2-selection', 'select2-selection--single');
    select.style.color = '#eeeef1';
    select.style.paddingLeft = '8px';
    select.style.paddingRight = '20px';

    select.options.add(new Option("Sort by Date", "data-id"));
    select.options.add(new Option("Sort by Views", "data-views"));
    select.options.add(new Option("Sort by Likes", "data-likes"));
    select.options.add(new Option("Sort by Ratio", "data-ratio"));

    return select;
}

function createIconElement(count, icon, size) {
    let proportionCountEl = document.createElement('div');
    proportionCountEl.classList.add('project-meta-item', artBlock, 'art-plus-label-'+icon);

    let ratioIcon = createFaIcon(icon, size);
    proportionCountEl.appendChild(ratioIcon);

    let ratioSpan = document.createElement('span');
    ratioSpan.classList.add('ratio-art-ext');

    proportionCountEl.appendChild(ratioIcon);
    proportionCountEl.appendChild(ratioSpan);

    let ratioArtExt = proportionCountEl.querySelector('.ratio-art-ext');
    ratioArtExt.appendChild(count);

    return proportionCountEl;
}

function insertIcon(block, element, icon, size) {
    const iconElement = createIconElement(element, icon, size);
    if (!block.querySelector('.art-plus-label-'+icon)) {
        block.appendChild(iconElement);
    }
}

function createDownloadButton() {
    let alreadyButton = document.querySelector('.'+downloadButton);
    if (alreadyButton) return alreadyButton;

    const panel = document.querySelector('.action-buttons > ul');
    let li = document.createElement('li');
    let button = document.createElement('button');
    button.classList.add('btn', 'btn-warning', 'btn-sm', downloadButton);
    button.setAttribute('type', 'button');
    let icon = document.createElement('i');
    icon.classList.add('far', 'fa-download', 'fa-pad-right');
    button.appendChild(icon);
    button.appendChild(document.createTextNode('Download all images'));
    li.appendChild(button);
    panel.appendChild(li);

    return button;
}

function createDialog(url) {
    for (const e of document.querySelectorAll('dialog.art-plus-modal')) {
        e.remove();
    }

    const dialog = document.createElement('dialog');
    dialog.classList.add('art-plus-modal');

    dialog.style.setProperty('--width', '500px');
    dialog.style.setProperty('--height', '300px');
    dialog.style.padding = '0';
    dialog.style.backgroundColor = '#18181c';
    dialog.style.borderRadius = '6px';
    dialog.style.border = '1px solid rgba(0,0,0,.2)';
    dialog.style.backgroundClip = 'padding-box';
    dialog.style.outline = '0';
    dialog.style.boxShadow = '0 5px 15px rgba(0,0,0,.5)';

    const iframe = createDialogIframe();
    iframe.src = chrome.runtime.getURL(url);
    dialog.append(iframe);

    (document.body || document.documentElement).append(dialog);

    dialog.showModal();

    // disable default Escape button
    dialog.addEventListener('cancel', (event) => {
        event.preventDefault();
    });

    iframe.onload = function() {
        setTimeout(function() {
            iframe.contentWindow.focus();
        }, 100);
    };

    return dialog;
}

function createDialogIframe() {
    const iframe = document.createElement('iframe');

    iframe.style.colorScheme = 'none';
    iframe.style.border = 'none';
    iframe.style.backgroundColor = 'transparent';
    iframe.style.width = 'min(90vw, var(--width))';
    iframe.style.height = 'min(80vh, var(--height))';
    iframe.style.display = 'block';

    return iframe;
}

function createTrendEl(trend) {
    const trendEl = document.createElement('span');
    trendEl.style.color = "#6cfffd";
    trendEl.textContent = trend;
    return trendEl;
}

// -----------------------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------------------

function calculateRatio(views, likes) {
    let ratio = 0;
    if ((views !== 0) && (likes !== 0)) {
        ratio = (views / likes).toFixed(1);
    }
    return ratio;
}

function rateColor(ratio) {
    let color = '#bc6b6d'; // darkred
    if (ratio === 0) {
        color = "inherit"; // default
    } else if (ratio <= 6) {
        color = "#6cfffd"; // aqua
    } else if (ratio <= 11) {
        color = "#5cb85c"; // green
    } else if (ratio <= 16) {
        color = "#cbcb21"; // yellow
    } else if (ratio <= 21) {
        color = "#fe6b6b"; // red
    }

    let ratioEl = document.createElement('span');
    ratioEl.style.color = color;
    ratioEl.textContent = ratio;

    return ratioEl;
}

function kFormatter(num) {
    return Math.abs(num) > 999
        ? Math.sign(num)*((Math.abs(num)/1000).toFixed(1)) + 'K'
        : Math.sign(num)*Math.abs(num);
}

function sortElementsByAttribute(attributeName, direction = "asc") {
    const ascending = direction === "asc";
    const parentElement = document.querySelector('#projects-list');
    const elements = Array.from(parentElement.querySelectorAll('.project'));

    const sortedElements = [...elements].sort((a, b) => {
        const firstValue = parseFloat(a.getAttribute(attributeName));
        const secondValue = parseFloat(b.getAttribute(attributeName));
        if (firstValue < secondValue) {
            return ascending ? -1 : 1;
        }
        if (firstValue > secondValue) {
            return ascending ? 1 : -1;
        }
        return 0;
    });

    for (let element of sortedElements) {
        parentElement.appendChild(element);
    }
}

function getHash(project, name) {
    let link;
    switch (name) {
        case "myprojects":
            link = project.querySelector('.project-link')
                .getAttribute("href");
            break;
        case "artwork":
            link = path;
            break;
        default:
            link = project.querySelector('a')
                .getAttribute("href")
                .split(/[#?]/)[0];
            break;
    }
    return link.replace('/edit', '').split('/').pop();
}

async function getProjectInfo(hash) {
    if (!hash) return;

    let data = cache.get(hash);
    if (data) return data;

    let response = await fetch(websiteProjectUrl + hash + '.json', {})
        .then(response => response.json())
        .then(data => {
            return data;
        }).catch(reason => {
            console.log(reason);
        });
    cache.set(hash, response);
    return response;
}

function checkUrlChange() {
    if (!path) return;
    if (path !== window.location.pathname) {
        if (handleID) clearInterval(handleID);
        init();
    }
}

function setPath() {
    path = window.location.pathname;
    pathQuery = window.location.search;
}

function injectsCSS() {
    let link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = chrome.runtime.getURL('/css/styles.css');
    document.head.appendChild(link);
}

function loadTrendingPages() {
    const promises = [];
    const pages = 3;
    const perPage = 100;

    for (let i = 1; i <= pages; i++) {
        const promise = getJson(website + 'api/v2/community/explore/projects/trending.json?dimension=all&per_page=' + perPage + '&page=' + i)
            .then(function(page) {
                const pageData = page.data;
                let place = 1;
                const itemPromises = pageData.map(function(item) {
                    trend[item.id] = place + (perPage * i) - perPage;
                    place++;
                });
                return Promise.all(itemPromises);
            });
        promises.push(promise);
    }

    return Promise.all(promises);
}


function getJson(url) {
    return fetch(url, {})
        .then(function(response) {
            return response.json();
        })
        .then(function(data) {
            return data;
        });
}

function getOption(option) {
    return new Promise((resolve) => {
        chrome.storage.local.get(option, (data) => {
            const setting = data[option] !== undefined ? data[option] : options[option];
            resolve(setting);
        });
    });
}

// -----------------------------------------------------------------------------------------
// Cache
// -----------------------------------------------------------------------------------------
class SessionCache extends Map {
    set(id, value) {
        if (typeof value === 'object') value = JSON.stringify(value);
        sessionStorage.setItem(id, value);
    }

    get(id) {
        const value = sessionStorage.getItem(id);
        try {
            return JSON.parse(value);
        } catch (e) {
            return value;
        }
    }
}