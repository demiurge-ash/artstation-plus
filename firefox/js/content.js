/*******************************************************************************

 Artstation Plus — a browser extension
 Copyright (C) 2023-present Demiurge Ash

 Home: https://github.com/demiurge-ash/artstation-plus

 ******************************************************************************/

const cache = new SessionCache();
const artBlock = 'art-plus-icons';
const downloadButton = 'art-plus-download-button';
const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
let path;
let pathQuery;
let handleID;
let handleStatus = false;
let statsID;
let projectsLoaded = false;
let trend = [];
let options = {
    legacyDesign: true
};
let statViews = 0;
let statLikes = 0;
let statsKey;

injectsCSS();
init();
setInterval(checkUrlChange, 1000);

function download() {
    let button = createDownloadButton();

    button.addEventListener('click', () => {
        const button = document.querySelector('.' + downloadButton)
        button.setAttribute('disabled','disabled');

        let data = {
            fullname: document.querySelector('meta[property="og:title"]').getAttribute('content'),
            username: path.split('/')[1]
        };

        chrome.storage.local.set({
            userdata: data
        });

        const dialog = createDialog('/ui/download.html');

        window.addEventListener('message', function (event) {
            if (event.data === 'closeModal') {
                dialog.close();
                button.removeAttribute('disabled');
            }
        });
    });
}

function InfoBlockArtwork(data, div) {
    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    let metaBlock = document.createElement('div');
    metaBlock.classList.add('d-flex', 'align-items-center', artBlock, 'art-plus-label-crosshairs');
    if (!div.querySelector('.art-plus-label-crosshairs')) {
        div.appendChild(metaBlock);
        insertIcon(metaBlock, ratioEl, 'crosshairs', 'lg');
    }

    if (data.id in trend) {
        let metaBlockTrend = document.createElement('div');
        metaBlockTrend.classList.add('d-flex', 'align-items-center', artBlock, 'art-plus-label-trend');
        if (!div.querySelector('.art-plus-label-trend')) {
            div.appendChild(metaBlockTrend);
            const trendNode = createTrendEl(trend[data.id]);
            insertIcon(metaBlockTrend, trendNode, 'trend', 'lg');
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
    const currentDate = new Date();
    const year = currentDate.getFullYear();
    const month = (currentDate.getMonth() + 1).toString().padStart(2, '0');
    const day = currentDate.getDate().toString().padStart(2, '0');
    statsKey = year + month + day;

    const header = document.querySelector(".page-title");

    const stats = document.createElement('div');
    stats.classList.add('statistics');

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

    header.appendChild(stats);

    statsID = setInterval(showStatistics, 1000);
}

function showStatistics() {
    if (!projectsLoaded) return;
    if (statsID) clearInterval(statsID);

    const views = document.querySelector(".statistics-views");
    views.textContent = addSpacesToNumber(statViews) + ' views';

    const likes = document.querySelector(".statistics-likes");
    likes.textContent = addSpacesToNumber(statLikes) + ' likes';

    chrome.storage.local.get('stats', function(result) {
        const statsData = result.stats;

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

                }
            }
        }

        const cachedStats = {};
        if (previousKey) {
            cachedStats[previousKey] = previousStats;
        }
        cachedStats[statsKey] = {
            views: statViews,
            likes: statLikes
        };

        chrome.storage.local.set({
            stats: cachedStats
        });

    });

}

function updateStatistics(data) {
    const viewsInt = parseInt(data.views_count);
    if (!isNaN(viewsInt) && viewsInt > 0) {
        statViews += viewsInt;
    }
    const likesInt = parseInt(data.likes_count);
    if (!isNaN(likesInt) && likesInt > 0) {
        statLikes += likesInt;
    }
}

function createSortSelect() {
    let selectSpan = createSelectSpan();
    let select = createSortSelectEl();
    const portfolioContainer = document.querySelector(".portfolio-content-select");
    const firstPortfolioDiv = portfolioContainer.querySelector('div:first-child');
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

    //short publish label:
    //"Publish" to "Publ" & "Not Published" to "Not"
    const label = div.querySelector('.label');
    label.textContent = label.textContent.slice(0, 4).trim();

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

function handle(info) {
    if (handleStatus) return;
    handleStatus = true;

    const projectsList = document.querySelector(info.container);
    if (projectsList) {
        const divs = projectsList.querySelectorAll(info.item);
        let activeRequests = 0;
        divs.forEach((div) => {

            switchToLegacyDesign(div, info);

            if (!div.querySelector('.' + artBlock)) {
                const hash = getHash(div, info.name);
                activeRequests++;
                getProjectInfo(hash)
                    .then(data => {
                        if (data !== 'undefined') {
                            createInfoBlock(data, div, info.name);
                        }
                    }).catch(reason => {
                        console.log(reason);
                    }).finally(() => {
                        activeRequests--;
                        if (activeRequests === 0) {
                            projectsLoaded = true;
                            handleStatus = false;
                        }
                });
            }
        });
    }

}

function init() {
    let info = false;
    setPath();

    getOption('legacyDesign').then((legacyDesign) => {
        options['legacyDesign'] = legacyDesign;
        if (legacyDesign) {
            document.body.classList.add('legacy-design');
        }
    });

    //  Profile Gallery
    //  artstation.com/{username}
    if (document.querySelector('user-projects')) {

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
            info = {
                name: "profile",
                container: ".visible-gallery .gallery",
                item: ".project",
                legacyDesignPreview: ".overlay",
                legacyDesignIcon: ".gallery-grid-icons"
            }
        }
    }

    // Profile
    // artstation.com/{username}
    if (document.querySelector('.navbar-artist-profile')) {
        download();
    }

    //  Trending, Following & Latest Galleries
    //  artstation.com/?sort_by={sort}
    if (pathQuery.startsWith("?sort_by=")) {
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
        createSortSelect();
        createStatistics();
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
}
