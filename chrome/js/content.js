/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

const cache = new SessionCache();
const getJson = createCachedJsonFetcher();
const artBlock = 'art-plus-icons';
const downloadButton = 'art-plus-download-button';
const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
const websiteUserUrl = website + 'users/';
let uniqueIds = [];
let path;
let pathQuery;
let handleID;
let handleUnidentifiedPageID;
let handleStatus = false;
let statsID;
let projectsLoaded = false;
let trend = [];
let options = {
    legacyDesign: true
};
let statViews = 0;
let statLikes = 0;
let statFollowers = 0;
let statComments = 0;
let statsKey;
let pageVersion = 0;
let pendingProjects = new WeakSet();
let closeDownloadDialog;

injectsCSS();
setInterval(checkUrlChange, 1000);
init();

function download() {
    let button = createDownloadButton();
    if (!button) return;

    button.addEventListener('click', async () => {
        if (button.disabled) return;
        button.disabled = true;
        const version = pageVersion;

        try {
            const username = path.split('/')[1];
            const title = document.querySelector('meta[property="og:title"]');
            await chrome.storage.local.set({
                userdata: {
                    fullname: title ? title.getAttribute('content') : username,
                    username: username
                }
            });
            if (version !== pageVersion) return;

            const dialog = createDialog('/ui/download.html');
            const onMessage = function (event) {
                if (event.origin === 'chrome-extension://' + chrome.runtime.id && event.data === 'closeModal') {
                    closeDownloadDialog();
                }
            };

            closeDownloadDialog = function () {
                window.removeEventListener('message', onMessage);
                dialog.close();
                dialog.remove();
                button.disabled = false;
                closeDownloadDialog = undefined;
            };
            window.addEventListener('message', onMessage);
        } catch (error) {
            button.disabled = false;
            console.error(error);
        }
    });
}

function userPage() {
    if (handleID) return;

    let userProjects = document.querySelectorAll('user-projects');
    let visibleUserProject;
    let userProjectsArray = Array.from(userProjects);

    userProjectsArray.forEach((element) => {
        let styles = window.getComputedStyle(element);

        let display = styles.getPropertyValue("display");
        let visibility = styles.getPropertyValue("visibility");

        if (display !== "none" && visibility !== "hidden") {
            visibleUserProject = element;
        }
    });

    if (visibleUserProject) {
        visibleUserProject.classList.add('visible-gallery');
        const info = {
            name: "main",
            container: ".gallery-grid",
            item: "projects-list-item",
            legacyDesignPreview: ".gallery-grid-overlay",
            legacyDesignIcon: ".gallery-grid-icons"
        }
        handleID = setInterval(handle, 1000, info);
    }
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

    if (data.id in trend) {
        let metaBlockTrend = document.createElement('div');
        metaBlockTrend.classList.add('d-flex', 'align-items-center', artBlock, 'art-plus-label-trend');
        if (!div.querySelector('.art-plus-label-trend')) {
            wrapper.appendChild(metaBlockTrend);
            const trendNode = createTrendEl(trend[data.id]);
            insertIcon(metaBlockTrend, trendNode, 'trend', 'lg');

            let label = document.createElement('span');
            label.classList.add('art-plus-label-text');
            label.textContent = ' Rank';
            metaBlockTrend.appendChild(label);
        }
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
    if (data.id in trend) {
        const trendNode = createTrendEl(trend[data.id]);
        createGalleryIcon(ul, 'trend', trendNode);
    }
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
    followersEl.appendChild(followers);

    header.appendChild(stats);

    loadUserInfo();
    statsID = setInterval(showStatistics, 1000);
}

function loadUserInfo() {
    const username = getUsername();
    if (!username) return;
    const version = pageVersion;

    getJson(websiteUserUrl + username + '.json')
        .then(function (result) {
            if (version !== pageVersion) return;
            const followers = result.followers_count;
            const followersEl = document.querySelector(".statistics-followers");
            if (!followersEl) return;
            statFollowers = followers;
            followersEl.textContent = addSpacesToNumber(followers) + ' followers';
        }).catch(reason => {
            console.log(reason);
        });;
}

function showStatistics() {
    if (!projectsLoaded) return;

    const views = document.querySelector(".statistics-views");
    const likes = document.querySelector(".statistics-likes");
    const comments = document.querySelector(".statistics-comments");
    if (!views || !likes || !comments) return;
    if (statsID) clearInterval(statsID);
    statsID = undefined;

    views.textContent = addSpacesToNumber(statViews) + ' views';
    likes.textContent = addSpacesToNumber(statLikes) + ' likes';
    comments.textContent = addSpacesToNumber(statComments) + ' comments';
    const version = pageVersion;

    chrome.storage.local.get('stats', function(result) {
        const error = chrome.runtime.lastError;
        if (version !== pageVersion) return;
        if (error) {
            console.error(error.message);
            return;
        }
        const statsData = result.stats || {};

        let previousKey = null;
        let previousStats = null;
        for (const key in statsData) {
            if (parseInt(key) < statsKey) {
                if (!previousKey || parseInt(key) > parseInt(previousKey)) {
                    previousKey = key;
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
            stats: cachedStats
        });

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
    updateStatistics(data);

    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    const metaBlock = div.querySelector('.project-meta');
    metaBlock.classList.add(artBlock);

    insertIcon(metaBlock, ratioEl, 'crosshairs');

    if (data.id in trend) {
        const trendNode = createTrendEl(trend[data.id]);
        insertIcon(metaBlock, trendNode, 'trend');
    }

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

function handleUnidentifiedPage() {
    download();
    userPage();
}

function handle(info) {
    if (handleStatus) return;
    handleStatus = true;
    const version = pageVersion;
    const pending = pendingProjects;

    try {
        if (info.name === 'myprojects') {
            createSortSelect();
            createStatistics();
        }

        let hasProjects = false;
        let allProjectsLoaded = true;
        const projectsLists = document.querySelectorAll(info.container);
        projectsLists.forEach((projectsList) => {
            const divs = projectsList.querySelectorAll(info.item);
            divs.forEach((div) => {
                hasProjects = true;
                try {
                    switchToLegacyDesign(div, info);
                    if (div.querySelector('.' + artBlock)) return;
                    allProjectsLoaded = false;
                    if (pending.has(div)) return;

                    const hash = getHash(div, info.name);
                    if (!hash) return;
                    pending.add(div);
                    getProjectInfo(hash)
                        .then(data => {
                            if (version === pageVersion && div.isConnected && !div.querySelector('.' + artBlock)) {
                                createInfoBlock(data, div, info.name);
                            }
                        }).catch(reason => {
                            console.log(reason);
                        }).finally(() => {
                            pending.delete(div);
                        });
                } catch (error) {
                    allProjectsLoaded = false;
                    console.error(error);
                }
            });
        });
        projectsLoaded = hasProjects && allProjectsLoaded;
    } catch (error) {
        console.error(error);
    } finally {
        handleStatus = false;
    }
}

function cleanupPage() {
    pageVersion++;
    clearInterval(handleID);
    clearInterval(handleUnidentifiedPageID);
    clearInterval(statsID);
    handleID = undefined;
    handleUnidentifiedPageID = undefined;
    statsID = undefined;
    handleStatus = false;
    projectsLoaded = false;
    pendingProjects = new WeakSet();
    uniqueIds = [];
    trend = [];
    statViews = 0;
    statLikes = 0;
    statFollowers = 0;
    statComments = 0;
    statsKey = undefined;

    if (closeDownloadDialog) closeDownloadDialog();
    const selectors = [
        '.art-plus-icons-list', '.art-plus-wrapper',
        '.art-plus-label-crosshairs', '.art-plus-label-trend',
        '.art-plus-statistics', '.art-plus-sort', '.art-plus-download-container'
    ];
    document.querySelectorAll(selectors.join(', ')).forEach(element => element.remove());
    document.querySelectorAll('.' + artBlock).forEach(element => element.classList.remove(artBlock));
}

function init() {
    cleanupPage();
    let info = false;
    setPath();
    const version = pageVersion;

    getOption('legacyDesign').then((legacyDesign) => {
        if (version !== pageVersion) return;
        options['legacyDesign'] = legacyDesign;
        document.body.classList.toggle('legacy-design', legacyDesign);
    }).catch(error => {
        console.error(error);
    });

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

    loadTrendingPages()
        .then(function(result) {})
        .catch(function(error) {
            console.error(error);
        });

    if (info) handleID = setInterval(handle, 1000, info);
    if (!info) handleUnidentifiedPageID = setInterval(handleUnidentifiedPage, 1000);
}
