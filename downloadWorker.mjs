import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { isMainThread, parentPort, workerData } from 'worker_threads';
import sizeOf from 'image-size';

if (isMainThread) {
    throw new Error('Download worker should not be run in the main thread');
}

const { imageUrl } = workerData;

async function downloadImage(url, filePath, retries = 3) {
    try {
        const response = await fetch(url);
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
        if (retries > 0) {
            console.log(`Retrying ${url}... (${3 - retries + 1})`);
            await downloadImage(url, filePath, retries - 1); // 递归重试
        } else {
            console.error('Error downloading image:', error);
            parentPort.postMessage('error');
        }
    }
}


downloadImage(imageUrl, path.basename(imageUrl));
