const website = 'https://www.artstation.com/';
const websiteProjectUrl = website + 'projects/';
const websiteUserUrl = website + 'users/';
let images;
let closeDialog = false;

chrome.storage.local.get('userdata', function (items) {
    download(items.userdata);
});

async function download(data) {
    images = [];

    closeButton();

    getJson(websiteUserUrl + data.username + '/projects.json?per_page=1')
        .then(async function (result) {
            const per_page = 50;
            const totalCount = result.total_count;
            const pages = Math.ceil(totalCount / per_page);

            await loadAllPages(data, pages);

            stopSpin();

            let totalImages = images.length;
            let totalSize = 0;


            if (totalImages > 0) {

                const totalEl = document.getElementById('total');
                totalEl.classList.remove('none');

                const foundEl = document.getElementById('download');
                foundEl.classList.remove('none');

                const folderEl = document.getElementById('username');
                folderEl.textContent = data.fullname;

                const progressEl = document.getElementById('progress');
                let completedCount = 0;

                for (const image of images) {
                    const totalCountEl = document.getElementById('total-count');
                    totalSize += image.filesize;
                    totalCountEl.textContent = nFormatter(totalSize).toString();
                }
                for (const image of images) {
                    if (closeDialog) return;

                    console.log('downloaded: ' + image.filename);

                    delete image.filesize;
                    image.conflictAction = 'overwrite';
                    image.saveAs = false;
                    image.message = "downloadFile";

                    //chrome.downloads.download(image);
                    await chrome.runtime.sendMessage(image);

                    completedCount++;
                    const progress = (completedCount / totalImages) * 100;
                    progressEl.style.width = progress + '%';

                    await sleep(200);

                    if (completedCount === totalImages) {
                        const doneEl = document.getElementById('done');
                        doneEl.classList.remove('none');
                        const showBtn = document.querySelector('.show-folder');

                        showBtn.onclick = function () {
                            //chrome.downloads.showDefaultFolder();
                            chrome.runtime.sendMessage('openFolder');
                        }
                    }
                }
            } else {
                const foundEl = document.getElementById('found-nothing');
                foundEl.classList.remove('none');
            }
        });
}

function loadAllPages(data, pages) {
    const promises = [];
    const fullname = cleanName(data.fullname);

    for (let i = 1; i <= pages; i++) {
        const promise = getJson(websiteUserUrl + data.username + '/projects.json?page=' + i)
            .then(function(page) {
                const pageData = page.data;
                const itemPromises = pageData.map(function(item) {
                    return saveImages(item, fullname);
                });
                return Promise.all(itemPromises);
            });
        promises.push(promise);
    }

    return Promise.all(promises);
}

async function saveImages(item, fullname) {
    return new Promise(async (resolve, reject) => {
        try {
            const project = await getJson(websiteProjectUrl + item.hash_id + '.json');
            let iteration = 0;

            const processedAssets = project.assets
                .filter(asset => asset.asset_type === 'image');

            for (const asset of processedAssets) {
                if (closeDialog) return;

                let positionName;
                if (iteration > 0) positionName = iteration;
                iteration++;

                const image = asset.image_url;
                const fileName = fullname
                    + '/'
                    + fullname
                    + ' - '
                    + cleanName(item.title)
                    + ' - '
                    + (positionName ? positionName + ' - ' : '')
                    + item.hash_id
                    + '.'
                    + getFileExtension(image);

                let filesize = await getFileSize(image);

                const imageData = {
                    url: image,
                    filename: fileName,
                    filesize: filesize,
                };

                await updateFoundCount();
                await sleep(100);

                images.push(imageData);
            }

            resolve();
        } catch (error) {
            reject(error);
        }
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function stopSpin() {
    const spinEl = document.getElementById('found-spin');
    spinEl.classList.remove('art-plus-icon-spin');
}

function updateFoundCount() {
    const foundCountEl = document.getElementById('found-count');
    let foundCount = parseInt(foundCountEl.textContent);
    if (foundCount === 0) {
        const foundEl = document.getElementById('found');
        foundEl.classList.remove('none');
    }
    foundCount++;
    foundCountEl.textContent = foundCount.toString();

    return Promise.resolve();
}

function getFileSize(url) {
    return fetch(url, {})
        .then(function(response) {
            const contentLength = response.headers.get('Content-Length');
            if (contentLength !== null) {
                return parseInt(contentLength, 10);
            } else {
                return 0;
            }
        })
        .catch(function(error) {
            console.log(error);
        });
}

function cleanName(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '-').trim();
}

function getFileExtension(url) {
    return url.split('.').pop().split(/[#?]/)[0];
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

function closeButton() {
    const showBtn = document.getElementById('close');
    showBtn.onclick = function() {
        closeDialog = true;
        window.parent.postMessage('closeModal', '*');
    }
}

function nFormatter(num) {
    if (num >= 1000000000) {
        return (num / 1000000000).toFixed(1).replace(/\.0$/, '') + 'Gb';
    }
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'Mb';
    }
    if (num >= 1000) {
        return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'Kb';
    }
    return num;
}