const activeUploads = new Map();

self.addEventListener('message', async (e) => {
  const { type, uploadId, data } = e.data;

  if (type === 'UPLOAD_BATCH') {
    handleBatch(uploadId, data);
  } else if (type === 'ABORT_UPLOAD') {
    const upload = activeUploads.get(uploadId);
    if (upload) {
      upload.aborted = true;
      for (const xhr of upload.activeXhrs.values()) {
        xhr.abort();
      }
      activeUploads.delete(uploadId);
    }
  } else if (type === 'URL_REFRESHED') {
    const key = `${uploadId}-${e.data.partNumber}`;
    const resolve = pendingCallbacks.get(key);
    if (resolve) {
      pendingCallbacks.delete(key);
      resolve(e.data);
    }
  }
});

const pendingCallbacks = new Map();

function waitForMessage(uploadId, partNumber) {
  return new Promise((resolve) => {
    const key = `${uploadId}-${partNumber}`;
    pendingCallbacks.set(key, resolve);
  });
}

async function handleBatch(uploadId, config) {
  const { parts, contentType, totalSize, maxRetries, completedBytes } = config;

  let state = activeUploads.get(uploadId);
  if (!state) {
    state = { aborted: false, activeXhrs: new Map(), bytesLoaded: completedBytes || 0 };
    activeUploads.set(uploadId, state);
  }

  const partBytesLoaded = {};

  const reportProgress = () => {
    const inFlightBytes = Object.values(partBytesLoaded).reduce((sum, b) => sum + b, 0);
    const totalLoaded = state.bytesLoaded + inFlightBytes;
    const percent = Math.round((totalLoaded / totalSize) * 95);
    self.postMessage({ type: 'PROGRESS', uploadId, percent: Math.min(percent, 95) });
  };

  try {
    const promises = parts.map(async (part) => {
      const { partNumber, url, blob, size } = part;
      let currentUrl = url;
      partBytesLoaded[partNumber] = 0;

      for (let attempt = 0; attempt < maxRetries; attempt++) {
        if (state.aborted) throw new Error('Upload aborted');

        try {
          const etag = await uploadChunk(state, currentUrl, blob, contentType, partNumber, partBytesLoaded, size, reportProgress);
          state.bytesLoaded += size;
          delete partBytesLoaded[partNumber];
          return { PartNumber: partNumber, ETag: etag };
        } catch (err) {
          if (state.aborted) throw new Error('Upload aborted');
          if (attempt === maxRetries - 1) throw err;
          partBytesLoaded[partNumber] = 0;
          await sleep(1000 * (attempt + 1));

          self.postMessage({ type: 'NEED_URL_REFRESH', uploadId, partNumber });
          const refreshed = await waitForMessage(uploadId, partNumber);
          currentUrl = refreshed.url;
        }
      }
    });

    const results = await Promise.all(promises);
    self.postMessage({ type: 'BATCH_COMPLETE', uploadId, parts: results });
  } catch (err) {
    if (!state.aborted) {
      self.postMessage({ type: 'BATCH_ERROR', uploadId, error: err.message });
    }
  }
}

function uploadChunk(state, url, blob, contentType, partNumber, partBytesLoaded, chunkSize, reportProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    state.activeXhrs.set(partNumber, xhr);
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', contentType);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        partBytesLoaded[partNumber] = e.loaded;
        reportProgress();
      }
    };

    xhr.onload = () => {
      state.activeXhrs.delete(partNumber);
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader('ETag');
        if (!etag) {
          reject(new Error('Missing ETag in response'));
          return;
        }
        partBytesLoaded[partNumber] = chunkSize;
        reportProgress();
        resolve(etag);
      } else {
        reject(new Error(`Part upload failed (${xhr.status})`));
      }
    };

    xhr.onerror = () => {
      state.activeXhrs.delete(partNumber);
      reject(new Error('Network error during part upload'));
    };

    xhr.send(blob);
  });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
