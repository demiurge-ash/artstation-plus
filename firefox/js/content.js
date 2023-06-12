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
    metaBlock.classList.add('d-flex', 'align-items-center', artBlock);
    div.appendChild(metaBlock);

    let proportionCountEl = createProportionCount(ratioEl, 'lg');
    metaBlock.appendChild(proportionCountEl);
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
    const viewsCount = data.views_count;
    const likesCount = data.likes_count;
    const ratioCount = calculateRatio(viewsCount, likesCount);
    const ratioEl = rateColor(ratioCount);

    const metaBlock = div.querySelector('.project-meta');
    metaBlock.classList.add(artBlock);

    const proportionCountEl = createProportionCount(ratioEl);
    metaBlock.appendChild(proportionCountEl);

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

function handle(info) {
    if (handleStatus) return;
    handleStatus = true;

    const projectsList = document.querySelector(info.container);
    if (projectsList) {
        const divs = projectsList.querySelectorAll(info.item);
        divs.forEach((div) => {
            if (!div.querySelector('.' + artBlock)) {
                const hash = getHash(div, info.name);
                getProjectInfo(hash)
                    .then(data => {
                        createInfoBlock(data, div, info.name);
                    }).catch(reason => {
                    console.log(reason);
                });
            }
        });
    }

    handleStatus = false;
}

function init() {
    let info = false;
    setPath();

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
                item: ".project"
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
            item: "projects-list-item"
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

    if (info) handleID = setInterval(handle, 1000, info);
}
