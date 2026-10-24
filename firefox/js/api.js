function isApiCount(value) {
    return (typeof value === 'number' || (typeof value === 'string' && value.trim() !== ''))
        && Number.isSafeInteger(Number(value)) && Number(value) >= 0;
}

function isRetryableApiError(error) {
    return error.name === 'TimeoutError' || error instanceof TypeError || error.retryable === true;
}

function createApiClient({ concurrency = 4, timeout = 15000, retries = 2, credentials = 'same-origin' } = {}) {
    const controller = new AbortController();
    const queue = [];
    const pending = new Map();
    const pausedUntil = new Map();
    let activeRequests = 0;
    let nextApiRequestAt = 0;

    function abortError() {
        return new DOMException('Request cancelled', 'AbortError');
    }

    function wait(delay) {
        if (controller.signal.aborted) return Promise.reject(abortError());
        if (delay <= 0) return Promise.resolve();

        return new Promise((resolve, reject) => {
            const onAbort = () => {
                clearTimeout(timer);
                reject(abortError());
            };
            const timer = setTimeout(() => {
                controller.signal.removeEventListener('abort', onAbort);
                resolve();
            }, Math.min(delay, 2147483647));
            controller.signal.addEventListener('abort', onAbort, { once: true });
        });
    }

    async function fetchOnce(url, method, read) {
        const attemptController = new AbortController();
        const onAbort = () => attemptController.abort();
        controller.signal.addEventListener('abort', onAbort, { once: true });
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            attemptController.abort();
        }, timeout);

        try {
            if (controller.signal.aborted) throw abortError();
            const response = await fetch(url, { method: method, signal: attemptController.signal, credentials: credentials });
            if (!response.ok) {
                const error = new Error('ArtStation request failed: ' + response.status + ' (' + method + ' ' + url + ')');
                error.status = response.status;
                error.retryable = [408, 429, 500, 502, 503, 504].includes(response.status);
                if (error.retryable) {
                    const retryAfter = response.headers.get('Retry-After');
                    const retryAt = retryAfter && (/^\d+$/.test(retryAfter)
                        ? Date.now() + Number(retryAfter) * 1000
                        : Date.parse(retryAfter));
                    const origin = new URL(url).origin;
                    if (Number.isFinite(retryAt)) {
                        pausedUntil.set(origin, Math.max(pausedUntil.get(origin) || 0, retryAt));
                    } else if (response.status === 429) {
                        pausedUntil.set(origin, Math.max(pausedUntil.get(origin) || 0, Date.now() + 1000));
                    }
                }
                attemptController.abort();
                throw error;
            }
            return await read(response);
        } catch (error) {
            if (controller.signal.aborted) throw abortError();
            if (timedOut) throw new DOMException('ArtStation request timed out', 'TimeoutError');
            throw error;
        } finally {
            clearTimeout(timer);
            controller.signal.removeEventListener('abort', onAbort);
        }
    }

    async function fetchWithRetries(url, method, read) {
        const origin = new URL(url).origin;
        const interval = method === 'GET' && origin === 'https://www.artstation.com' ? 100 : 0;
        for (let attempt = 0; ; attempt++) {
            while (true) {
                const nextStart = Math.max(pausedUntil.get(origin) || 0, interval ? nextApiRequestAt : 0);
                const delay = nextStart - Date.now();
                if (delay <= 0) break;
                await wait(delay);
            }
            if (interval) nextApiRequestAt = Date.now() + interval;
            try {
                return await fetchOnce(url, method, read);
            } catch (error) {
                if (controller.signal.aborted) throw abortError();
                if (!isRetryableApiError(error) || attempt >= retries) throw error;
                await wait(1000 * (2 ** attempt));
            }
        }
    }

    function runQueue() {
        while (activeRequests < concurrency && queue.length > 0) {
            const job = queue.shift();
            activeRequests++;
            fetchWithRetries(job.url, job.method, job.read)
                .then(job.resolve, job.reject)
                .finally(() => {
                    activeRequests--;
                    runQueue();
                });
        }
    }

    function request(url, method, read) {
        if (controller.signal.aborted) return Promise.reject(abortError());
        const key = method + ' ' + url;
        if (pending.has(key)) return pending.get(key);

        const promise = new Promise((resolve, reject) => {
            queue.push({ url: url, method: method, read: read, resolve: resolve, reject: reject });
        });
        pending.set(key, promise);
        promise.then(() => pending.delete(key), () => pending.delete(key));
        runQueue();
        return promise;
    }

    return {
        signal: controller.signal,
        getJson(url, validate) {
            return request(url, 'GET', response => response.json()).then(data => {
                if (controller.signal.aborted) throw abortError();
                if (validate && !validate(data)) throw new Error('Invalid ArtStation response: ' + url);
                return data;
            });
        },
        getFileSize(url) {
            return request(url, 'HEAD', response => {
                const length = response.headers.get('Content-Length');
                return isApiCount(length) ? Number(length) : 0;
            });
        },
        abort() {
            controller.abort();
            for (const job of queue.splice(0)) job.reject(abortError());
        }
    };
}
