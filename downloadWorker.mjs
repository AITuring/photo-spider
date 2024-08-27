import fetch from 'node-fetch';
import fs, { copyFile } from 'fs';
import https from 'https';
import path from 'path';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import sizeOf from 'image-size';

const httpsAgent = new https.Agent({
    rejectUnauthorized: false // 忽略证书错误
});


if (isMainThread) {
    throw new Error('Download worker should not be run in the main thread');
}

const { imageUrl } = workerData;

async function downloadImage(url, filePath) {
    try {
        const response = await fetch(url, { agent: httpsAgent });
        const buffer = await response.buffer();


        // 获取图片尺寸
        const dimensions = sizeOf(buffer);
        const { width, height } = dimensions;

        // 检查图片尺寸是否小于500x500
        if (width < 500 || height < 500) {
            parentPort.postMessage('skip');
            return;
        }

        const absoluteFilePath = path.join('./pictures', filePath);
        fs.writeFileSync(absoluteFilePath, buffer);
        parentPort.postMessage('success');
    } catch (error) {
        console.error('Error downloading image:', error);
        parentPort.postMessage('error');
    }
}

downloadImage(imageUrl, path.basename(imageUrl));