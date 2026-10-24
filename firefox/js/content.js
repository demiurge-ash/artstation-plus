/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

const cache = new MemoryCache();
const getJson = createCachedJsonFetcher();
const getProjectJson = createProjectJsonFetcher(() => api);
const artBlock = 'art-plus-icons';
const downloadButton = 'art-plus-download-button';
const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
const websiteUserUrl = website + 'users/';
let uniqueIds = [];
let path;
let pathQuery;
let statsID;
let projectsLoaded = false;
let trend = [];
let options = {
    legacyDesign: true
};
let statViews = 0;
let statLikes = 0;
let statFollowers;
let statComments = 0;
let statsKey;
let pageVersion = 0;
let api;
let closeDownloadDialog;
let pageInfo;
let pageObserver;
let pageUpdateID;
let pageUIQueued = false;
let pruneQueued = false;
let activeProjects = 0;
let statisticsDirty = false;
let hasLoadedProjects = false;
const projectObservers = new Map();
const projectStates = new Map();
const projectQueue = new Set();
const projectInfoSelector = '.art-plus-icons-list, .art-plus-wrapper, .art-plus-label-crosshairs, .art-plus-label-trend';
const pageUISelector = '.page-title, .portfolio-content-select, .user-buttons';
const extensionSelector = projectInfoSelector + ', .art-plus-statistics, .art-plus-sort, .art-plus-download-container, .art-plus-modal';
const projectMutationSelector = extensionSelector + ', .art-plus-overlay, .art-plus-overlay-icons';

injectsCSS();
if (window.navigation) {
    window.navigation.addEventListener('currententrychange', checkUrlChange);
} else {
    setInterval(checkUrlChange, 1000);
}
window.addEventListener('popstate', checkUrlChange);
window.addEventListener('pagehide', cleanupPage);
window.addEventListener('pageshow', event => {
    if (event.persisted) init();
});
init();

function download() {
    let button = createDownloadButton();
    if (!button) return;

    button.addEventListener('click', () => {
        if (button.disabled) return;
        button.disabled = true;
        let onRequest;

        try {
            const token = crypto.randomUUID();
            const username = path.split('/')[1];
            const title = document.querySelector('meta[property="og:title"]');
            onRequest = function (message, sender, sendResponse) {
                if (sender.id !== chrome.runtime.id || message?.message !== 'getDownloadData' || message.token !== token) return;
                chrome.runtime.onMessage.removeListener(onRequest);
                sendResponse({
                    username: username,
                    fullname: title ? title.getAttribute('content') : username,
                    parentOrigin: window.location.origin
                });
            };
            chrome.runtime.onMessage.addListener(onRequest);

            const dialog = createDialog('/ui/download.html#' + token);
            const onMessage = function (event) {
                if (event.origin === chrome.runtime.getURL('').replace(/\/$/, '')
                    && event.data?.message === 'closeModal' && event.data.token === token) {
                    closeDownloadDialog();
                }
            };

            closeDownloadDialog = function () {
                chrome.runtime.onMessage.removeListener(onRequest);
                window.removeEventListener('message', onMessage);
                dialog.close();
                dialog.remove();
                button.disabled = false;
                closeDownloadDialog = undefined;
            };
            window.addEventListener('message', onMessage);
        } catch (error) {
            if (onRequest) chrome.runtime.onMessage.removeListener(onRequest);
            button.disabled = false;
            console.error(error);
        }
    });
}

function InfoBlockArtwork(data, div) {
    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    let wrapper = div.querySelector('.art-plus-wrapper');
    if (!wrapper) {
        wrapper = document.createElement('div');
        wrapper.classList.add('d-flex', 'align-items-center', 'gap-2', 'art-plus-wrapper');
        div.appendChild(wrapper);
    }

    let metaBlock = document.createElement('div');
    metaBlock.classList.add('d-flex', 'align-items-center', artBlock, 'art-plus-label-crosshairs');
    if (!div.querySelector('.art-plus-label-crosshairs')) {
        wrapper.appendChild(metaBlock);
        insertIcon(metaBlock, ratioEl, 'crosshairs', 'lg');

        let label = document.createElement('span');
        label.classList.add('art-plus-label-text');
        label.textContent = ' Ratio';
        metaBlock.appendChild(label);
    }
}

function InfoBlockMain(data, div) {
    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    const anchorDiv = div.querySelector('a');
    const ul = createGalleryUl(div);
    createGalleryIcon(ul, 'eye', kFormatter(viewsCount));
    createGalleryIcon(ul, 'thumbs-up', kFormatter(likesCount));
    createGalleryIcon(ul, 'crosshairs', ratioEl);
    anchorDiv.appendChild(ul);
}

function createStatistics() {
    const header = document.querySelector(".page-title");
    if (!header || header.querySelector('.art-plus-statistics')) return;

    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    statsKey = year + month + day;

    const stats = document.createElement('div');
    stats.classList.add('statistics', 'art-plus-statistics');

    const viewsEl = document.createElement('span');
    viewsEl.classList.add('statistics-views-block', 'stat-block');
    stats.appendChild(viewsEl);
    const views = document.createElement('span');
    views.classList.add('statistics-views');
    views.textContent = "Stats loading...";
    viewsEl.appendChild(views);

    const likesEl = document.createElement('span');
    likesEl.classList.add('statistics-likes-block', 'stat-block');
    stats.appendChild(likesEl);
    const likes = document.createElement('span');
    likes.classList.add('statistics-likes');
    likesEl.appendChild(likes);

    const commentsEl = document.createElement('span');
    commentsEl.classList.add('statistics-comments-block', 'stat-block');
    stats.appendChild(commentsEl);
    const comments = document.createElement('span');
    comments.classList.add('statistics-comments');
    commentsEl.appendChild(comments);

    const followersEl = document.createElement('span');
    followersEl.classList.add('statistics-followers-block', 'stat-block');
    stats.appendChild(followersEl);
    const followers = document.createElement('span');
    followers.classList.add('statistics-followers');
    followers.textContent = 'Followers loading...';
    followersEl.appendChild(followers);

    header.appendChild(stats);

    loadUserInfo();
    statisticsDirty = true;
    finishPageUpdate();
}

function loadUserInfo() {
    const username = getUsername();
    if (!username) {
        const followersEl = document.querySelector('.statistics-followers');
        if (followersEl) followersEl.textContent = 'Followers unavailable.';
        return;
    }
    const version = pageVersion;

    getJson(websiteUserUrl + username + '.json', data => data && isApiCount(data.followers_count),
        data => ({ followers_count: Number(data.followers_count) }))
        .then(function (result) {
            if (version !== pageVersion) return;
            const followers = result.followers_count;
            const followersEl = document.querySelector(".statistics-followers");
            if (!followersEl) return;
            statFollowers = followers;
            followersEl.textContent = addSpacesToNumber(followers) + ' followers';
            statisticsDirty = true;
            finishPageUpdate();
        }).catch(reason => {
            if (version === pageVersion && reason.name !== 'AbortError') {
                const followersEl = document.querySelector('.statistics-followers');
                if (followersEl) followersEl.textContent = 'Followers unavailable.';
                console.log(reason);
            }
        });;
}

function showStatistics() {
    statsID = undefined;
    if (!projectsLoaded || !statisticsDirty) return;

    const views = document.querySelector(".statistics-views");
    const likes = document.querySelector(".statistics-likes");
    const comments = document.querySelector(".statistics-comments");
    if (!views || !likes || !comments) return;
    statisticsDirty = false;

    views.textContent = addSpacesToNumber(statViews) + ' views';
    likes.textContent = addSpacesToNumber(statLikes) + ' likes';
    comments.textContent = addSpacesToNumber(statComments) + ' comments';
    const version = pageVersion;
    const snapshot = [statViews, statLikes, statFollowers, statComments];
    document.querySelectorAll('.art-plus-statistics .stat-diff').forEach(element => element.remove());

    const username = getUsername();
    if (!username || statFollowers === undefined) return;
    const storageKey = 'stats_' + username.toLowerCase();
    chrome.storage.local.get(storageKey, function(result) {
        const error = chrome.runtime.lastError;
        const current = [statViews, statLikes, statFollowers, statComments];
        if (version !== pageVersion || !projectsLoaded || statisticsDirty
            || snapshot.some((value, index) => value !== current[index])) return;
        if (error) {
            console.error(error.message);
            return;
        }
        const statsData = result[storageKey] || {};

        let previousKey = null;
        let previousStats = null;
        for (const key in statsData) {
            if (parseInt(key) < statsKey && (!previousKey || parseInt(key) > parseInt(previousKey))) {
                previousKey = key;
            }
        }
        if (previousKey) {
            previousStats = statsData[previousKey];
            const formattedDate = formatKeyToDate(previousKey);

            const diffViews = statViews - previousStats.views;
            if (diffViews > 0 && statViews > 0) {
                let diffViewsElement = document.querySelector(".statistics-diff-views");
                if (!diffViewsElement) {
                    diffViewsElement = document.createElement('span');
                    diffViewsElement.classList.add('statistics-diff-views', 'stat-diff');
                    diffViewsElement.title = `since ${formattedDate}`;
                }
                diffViewsElement.textContent = '+' + addSpacesToNumber(diffViews);
                const viewsEl = document.querySelector(".statistics-views-block");
                viewsEl.appendChild(diffViewsElement);
            }

            const diffLikes = statLikes - previousStats.likes;
            if (diffLikes > 0 && statLikes > 0) {
                let diffLikesElement = document.querySelector(".statistics-diff-likes");
                if (!diffLikesElement) {
                    diffLikesElement = document.createElement('span');
                    diffLikesElement.classList.add('statistics-diff-likes', 'stat-diff');
                    diffLikesElement.title = `since ${formattedDate}`;
                }
                diffLikesElement.textContent = '+' + addSpacesToNumber(diffLikes);
                const likesEl = document.querySelector(".statistics-likes-block");
                likesEl.appendChild(diffLikesElement);
            }

            const diffFollowers = statFollowers - previousStats.followers;
            if (diffFollowers > 0 && statFollowers > 0) {
                let diffFollowersElement = document.querySelector(".statistics-diff-followers");
                if (!diffFollowersElement) {
                    diffFollowersElement = document.createElement('span');
                    diffFollowersElement.classList.add('statistics-diff-followers', 'stat-diff');
                    diffFollowersElement.title = `since ${formattedDate}`;
                }
                diffFollowersElement.textContent = '+' + addSpacesToNumber(diffFollowers);
                const followersEl = document.querySelector(".statistics-followers-block");
                followersEl.appendChild(diffFollowersElement);
            }

            const diffComments = statComments - previousStats.comments;
            if (diffComments > 0 && statComments > 0) {
                let diffCommentsElement = document.querySelector(".statistics-diff-comments");
                if (!diffCommentsElement) {
                    diffCommentsElement = document.createElement('span');
                    diffCommentsElement.classList.add('statistics-diff-comments', 'stat-diff');
                    diffCommentsElement.title = `since ${formattedDate}`;
                }
                diffCommentsElement.textContent = '+' + addSpacesToNumber(diffComments);
                const commentsEl = document.querySelector(".statistics-comments-block");
                commentsEl.appendChild(diffCommentsElement);
            }
        }

        const cachedStats = {};
        if (previousKey) {
            cachedStats[previousKey] = previousStats;
        }
        cachedStats[statsKey] = {
            views: statViews,
            likes: statLikes,
            followers: statFollowers,
            comments: statComments
        };

        chrome.storage.local.set({
            [storageKey]: cachedStats
        }).catch(error => console.error(error));

    });

}

function updateStatistics(data) {
    if (!uniqueIds[data.id]) {
        uniqueIds[data.id] = true;
        const viewsInt = parseInt(data.views_count);
        if (!isNaN(viewsInt) && viewsInt > 0) {
            statViews += viewsInt;
        }
        const likesInt = parseInt(data.likes_count);
        if (!isNaN(likesInt) && likesInt > 0) {
            statLikes += likesInt;
        }
        const commentsInt = parseInt(data.comments_count);
        if (!isNaN(commentsInt) && commentsInt > 0) {
            statComments += commentsInt;
        }
    }
}

function createSortSelect() {
    if (document.querySelector('.art-plus-sort')) return;
    const portfolioContainer = document.querySelector(".portfolio-content-select");
    const firstPortfolioDiv = portfolioContainer?.querySelector('div:first-child');
    if (!firstPortfolioDiv) return;

    let selectSpan = createSelectSpan();
    selectSpan.classList.add('art-plus-sort');
    let select = createSortSelectEl();
    selectSpan.appendChild(select);
    firstPortfolioDiv.insertBefore(selectSpan, firstPortfolioDiv.firstChild);

    select.addEventListener('change', (event) => {
        const selectedValue = event.target.value;
        switch (selectedValue) {
            case "data-id":
                sortElementsByAttribute(selectedValue, "desc");
                break;
            case "data-views":
                sortElementsByAttribute(selectedValue, "desc");
                break;
            case "data-likes":
                sortElementsByAttribute(selectedValue, "desc");
                break;
            case "data-ratio":
                sortElementsByAttribute(selectedValue, "asc");
                break;
        }
    });
}

function InfoBlockMyProject(data, div) {
    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    const metaBlock = div.querySelector('.project-meta');
    metaBlock.classList.add(artBlock);

    insertIcon(metaBlock, ratioEl, 'crosshairs');

    // add attributes to preview block
    div.setAttribute('data-ratio', ratioCount);
    div.setAttribute('data-views', viewsCount);
    div.setAttribute('data-likes', likesCount);
}

function createInfoBlock(data, div, name) {
    if (!data) return;

    switch (name) {
        case "myprojects":
            InfoBlockMyProject(data, div);
            break;
        case "artwork":
            InfoBlockArtwork(data, div);
            break;
        default:
            InfoBlockMain(data, div);
            break;
    }
    createTrendInfo(data, div, name);
}

function createTrendInfo(data, div, name) {
    if (!(data.id in trend)) return;
    const trendNode = createTrendEl(trend[data.id]);

    if (name === 'artwork') {
        const wrapper = div.querySelector('.art-plus-wrapper');
        if (!wrapper || div.querySelector('.art-plus-label-trend')) return;
        const metaBlock = document.createElement('div');
        metaBlock.classList.add('d-flex', 'align-items-center', artBlock, 'art-plus-label-trend');
        wrapper.appendChild(metaBlock);
        insertIcon(metaBlock, trendNode, 'trend', 'lg');
        const label = document.createElement('span');
        label.classList.add('art-plus-label-text');
        label.textContent = ' Rank';
        metaBlock.appendChild(label);
    } else if (name === 'myprojects') {
        const metaBlock = div.querySelector('.project-meta');
        if (metaBlock) insertIcon(metaBlock, trendNode, 'trend');
    } else {
        const ul = div.querySelector('.art-plus-icons-list');
        if (ul && !ul.querySelector('.art-plus-trend')) createGalleryIcon(ul, 'trend', trendNode);
    }
}

function switchToLegacyDesign(div, info) {
    if (options['legacyDesign'] === true) {
        if (info.legacyDesignPreview) {
            const overlay = div.querySelector(info.legacyDesignPreview);
            const overlayStub = 'art-plus-overlay';
            if (overlay && !overlay.classList.contains(overlayStub)) {
                // remove events and triggers
                overlay.classList.add(overlayStub);
                overlay.removeAttribute('style');
                const clonedOverlay = overlay.cloneNode(true);
                overlay.parentNode.replaceChild(clonedOverlay, overlay);

                const icons = div.querySelector(info.legacyDesignIcon);
                const overlayStubIcons = 'art-plus-overlay-icons';
                if (icons) {
                    icons.classList.add(overlayStubIcons);
                    icons.removeAttribute('style');
                    const clonedOverlayIcons = icons.cloneNode(true);
                    icons.parentNode.replaceChild(clonedOverlayIcons, icons);
                }
            }
        }
    }
}

function schedulePageUpdate() {
    if (pageUpdateID === undefined) pageUpdateID = setTimeout(flushPageUpdate, 50);
}

function queueProject(element) {
    if (!element || !element.isConnected || !element.matches(pageInfo.item) || !element.closest(pageInfo.container)) return;
    projectQueue.add(element);
    schedulePageUpdate();
}

function queueProjects(root) {
    if (root.nodeType !== 1) return;
    queueProject(root.closest(pageInfo.item));
    root.querySelectorAll(pageInfo.item).forEach(queueProject);
}

function findContainers(root) {
    if (root.nodeType !== 1) return;
    if (root.matches(pageInfo.container)) observeContainer(root);
    root.querySelectorAll(pageInfo.container).forEach(observeContainer);
}

function observeContainer(container) {
    if (projectObservers.has(container)) return;
    const version = pageVersion;
    const observer = new MutationObserver(records => {
        if (version !== pageVersion || checkUrlChange()) return;
        for (const record of records) {
            if (record.target.closest(projectMutationSelector)) continue;
            const added = [...record.addedNodes].filter(node => node.nodeType === 1 && !node.matches(projectMutationSelector));
            const removed = [...record.removedNodes].filter(node => node.nodeType === 1
                && !node.matches('.art-plus-overlay, .art-plus-overlay-icons'));
            if (record.type !== 'attributes' && added.length === 0 && removed.length === 0) continue;
            if (removed.some(node => node.matches(pageInfo.item) || node.querySelector(pageInfo.item))) pruneQueued = true;
            queueProject(record.target.closest(pageInfo.item));
            added.forEach(queueProjects);
        }
        if (pruneQueued) schedulePageUpdate();
    });
    observer.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    projectObservers.set(container, observer);
    queueProjects(container);
}

function mountPageUI() {
    if (pageInfo.name === 'myprojects') {
        createSortSelect();
        createStatistics();
    }
    if (pageInfo.download) download();
}

function observePage() {
    const version = pageVersion;
    pageObserver = new MutationObserver(records => {
        if (version !== pageVersion || checkUrlChange()) return;
        for (const record of records) {
            if (record.target.closest(extensionSelector)) continue;
            if ([...projectObservers.keys()].some(container => container.contains(record.target))) continue;
            const added = [...record.addedNodes].filter(node => node.nodeType === 1 && !node.matches(extensionSelector));
            if (added.length === 0 && record.removedNodes.length === 0) continue;
            for (const node of record.removedNodes) {
                if (node.nodeType === 1 && [...projectObservers.keys()].some(container => node.contains(container))) pruneQueued = true;
            }
            for (const node of added) {
                findContainers(node);
                if (node.matches(pageUISelector) || node.querySelector(pageUISelector)) pageUIQueued = true;
            }
            if (record.target.closest(pageUISelector)) pageUIQueued = true;
        }
        if (pageUIQueued || pruneQueued) schedulePageUpdate();
    });
    const root = document.body || document.documentElement;
    pageObserver.observe(root, { childList: true, subtree: true });
    findContainers(root);
    mountPageUI();
}

function releaseProject(state) {
    if (state.pending) {
        state.pending = false;
        activeProjects--;
    }
}

function flushPageUpdate() {
    pageUpdateID = undefined;
    if (!pageInfo || checkUrlChange()) return;

    if (pruneQueued) {
        pruneQueued = false;
        for (const [container, observer] of projectObservers) {
            if (!container.isConnected) {
                observer.disconnect();
                projectObservers.delete(container);
            }
        }
        for (const [element, state] of projectStates) {
            if (!element.isConnected || !element.closest(pageInfo.container)) {
                releaseProject(state);
                projectStates.delete(element);
                statisticsDirty = true;
            }
        }
    }
    if (pageUIQueued) {
        pageUIQueued = false;
        mountPageUI();
    }
    const elements = [...projectQueue];
    projectQueue.clear();
    for (const element of elements) {
        try {
            processProject(element);
        } catch (error) {
            console.error(error);
        }
    }
    finishPageUpdate();
}

function clearProjectInfo(element) {
    element.querySelectorAll(projectInfoSelector).forEach(node => node.remove());
    element.classList.remove(artBlock);
    element.querySelectorAll('.' + artBlock).forEach(node => node.classList.remove(artBlock));
}

function renderProject(element, state) {
    if (pageInfo.name === 'myprojects' && !element.querySelector('.project-meta')) {
        state.rendered = false;
        return;
    }
    switchToLegacyDesign(element, pageInfo);
    const selector = pageInfo.name === 'main' ? '.art-plus-icons-list' : '.art-plus-label-crosshairs';
    if (!element.querySelector(selector)) {
        clearProjectInfo(element);
        createInfoBlock(state.data, element, pageInfo.name);
    } else {
        createTrendInfo(state.data, element, pageInfo.name);
    }
    state.rendered = !!element.querySelector(selector);
}

function processProject(element) {
    if (!element.isConnected || !element.closest(pageInfo.container)) return;
    const hash = getHash(element, pageInfo.name);
    let state = projectStates.get(element);
    if (!state || state.hash !== hash) {
        if (state) releaseProject(state);
        clearProjectInfo(element);
        state = { hash: hash, data: null, pending: false, failed: false, rendered: false };
        projectStates.set(element, state);
        projectsLoaded = false;
        statisticsDirty = true;
    }
    if (!hash || state.pending || state.failed) return;
    if (state.data) {
        renderProject(element, state);
        return;
    }

    const version = pageVersion;
    const info = pageInfo;
    const isCurrent = () => version === pageVersion && projectStates.get(element) === state
        && element.isConnected && element.closest(info.container) && getHash(element, info.name) === hash;
    state.pending = true;
    activeProjects++;
    getProjectInfo(hash)
        .then(data => {
            if (!isCurrent()) return;
            state.data = data;
            statisticsDirty = true;
            renderProject(element, state);
        }, error => {
            if (isCurrent() && error.name !== 'AbortError') {
                state.failed = true;
                const url = websiteProjectUrl + encodeURIComponent(hash) + '.json';
                console.log(error.message.includes(url) ? error.message : error.message + ': ' + url);
            }
        }).catch(error => {
            if (version === pageVersion) console.error(error);
        }).finally(() => {
            if (version !== pageVersion) return;
            releaseProject(state);
            finishPageUpdate();
        });
}

function finishPageUpdate() {
    if (!pageInfo || pageInfo.name !== 'myprojects' || activeProjects > 0 || projectQueue.size > 0 || pruneQueued) return;
    projectsLoaded = (projectStates.size > 0 || hasLoadedProjects)
        && [...projectStates.values()].every(state => state.data && state.rendered && !state.failed);
    if (!projectsLoaded) {
        const failedCount = [...projectStates.values()].filter(state => state.failed).length;
        const views = document.querySelector('.statistics-views');
        if (views) views.textContent = failedCount ? 'Stats unavailable: ' + failedCount + ' project(s) failed.'
            : projectStates.size === 0 ? 'No projects loaded.' : 'Stats loading...';
        document.querySelectorAll('.statistics-likes, .statistics-comments').forEach(element => element.textContent = '');
        document.querySelectorAll('.art-plus-statistics .stat-diff').forEach(element => element.remove());
        return;
    }
    if (!projectsLoaded || !statisticsDirty) return;
    hasLoadedProjects = true;
    uniqueIds = [];
    statViews = 0;
    statLikes = 0;
    statComments = 0;
    for (const state of projectStates.values()) updateStatistics(state.data);
    clearTimeout(statsID);
    statsID = setTimeout(showStatistics, 50);
}

function cleanupPage() {
    pageVersion++;
    if (pageObserver) pageObserver.disconnect();
    pageObserver = undefined;
    for (const observer of projectObservers.values()) observer.disconnect();
    projectObservers.clear();
    projectStates.clear();
    projectQueue.clear();
    if (api) api.abort();
    api = undefined;
    clearTimeout(pageUpdateID);
    clearTimeout(statsID);
    pageUpdateID = undefined;
    statsID = undefined;
    pageInfo = undefined;
    pageUIQueued = false;
    pruneQueued = false;
    activeProjects = 0;
    statisticsDirty = false;
    hasLoadedProjects = false;
    projectsLoaded = false;
    uniqueIds = [];
    trend = [];
    statViews = 0;
    statLikes = 0;
    statFollowers = undefined;
    statComments = 0;
    statsKey = undefined;

    if (closeDownloadDialog) closeDownloadDialog();
    document.querySelectorAll(extensionSelector).forEach(element => element.remove());
    document.querySelectorAll('.' + artBlock).forEach(element => element.classList.remove(artBlock));
}

function init() {
    cleanupPage();
    api = createApiClient();
    let info = false;
    setPath();
    const version = pageVersion;

    //  Trending, Following & Latest Galleries
    //  artstation.com/?sort_by={sort}
    if (pathQuery.includes("sort_by=") || path === '/') {
        info = {
            name: "main",
            container: ".gallery-grid",
            item: "projects-list-item",
            legacyDesignPreview: ".gallery-grid-overlay",
            legacyDesignIcon: ".gallery-grid-icons"
        }
    }

    //  Manage Portfolio
    //  artstation.com/myartstation/projects
    if (path.startsWith("/myartstation/projects")) {
        info = {
            name: "myprojects",
            container: ".project-list",
            item: ".project"
        }
    }

    //  Artwork page
    //  artstation.com/artwork/{hash}
    if (path.startsWith("/artwork/")) {
        info = {
            name: "artwork",
            container: ".project-sidebar-section",
            item: ".project-meta"
        }
    }

    if (!info) {
        info = {
            name: "main",
            container: "user-projects .gallery-grid",
            item: "projects-list-item",
            legacyDesignPreview: ".gallery-grid-overlay",
            legacyDesignIcon: ".gallery-grid-icons",
            download: true
        };
    }
    pageInfo = info;

    getOption('legacyDesign').catch(error => {
        console.error(error);
        return options['legacyDesign'];
    }).then(legacyDesign => {
        if (version !== pageVersion) return;
        options['legacyDesign'] = legacyDesign;
        document.body.classList.toggle('legacy-design', legacyDesign);
        observePage();
    }).catch(error => {
        console.error(error);
    });

    loadTrendingPages()
        .then(function() {
            if (version !== pageVersion) return;
            for (const [element, state] of projectStates) {
                if (element.isConnected && state.data && state.rendered && getHash(element, info.name) === state.hash) {
                    createTrendInfo(state.data, element, info.name);
                }
            }
        })
        .catch(function(error) {
            if (error.name !== 'AbortError') console.error(error);
        });
}
