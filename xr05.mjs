import fetch from 'node-fetch';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sizeOf from 'image-size';
import { Worker } from 'worker_threads';

// 获取当前脚本文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function downloadImage(url, filePath) {
    try {
        // 创建保存文件的目录
        const saveDirectory = path.join(__dirname, '');
        if (!fs.existsSync(saveDirectory)) {
            fs.mkdirSync(saveDirectory);
        }

        const response = await fetch(url);
        const buffer = await response.buffer();

        // 获取图片尺寸
        const dimensions = sizeOf(buffer);
        const { width, height } = dimensions;

        // 检查图片尺寸是否小于500x500
        if (width < 500 || height < 500) {
            console.log(`Image size is smaller than 500x500. Skipping download.`);
            return;
        }

        const absoluteFilePath = path.join(saveDirectory, filePath);
        fs.writeFileSync(absoluteFilePath, buffer);
        console.log(`Downloaded ${url}`);
    } catch (error) {
        console.error(`Error downloading ${url}:`, error);
    }
}

async function getImages(url) {
    try {
        const response = await fetch(url);
        const html = await response.text();
        const $ = cheerio.load(html);

        const images = [];
        $('img').each((index, element) => {
            let src = $(element).attr('src');
            // 确保 src 是有效的 URL
            if (src) {
                // 如果 src 是相对路径，构造完整的 URL
                if (!src.startsWith('http://') && !src.startsWith('https://')) {
                    src = new URL(src, url).href; // 使用 URL 构造函数来处理相对路径
                }
                console.log(`Found image: ${src}`);
                images.push(src);
            }
        });

        return images;
    } catch (error) {
        console.error('Error getting images:', error);
        return [];
    }
}

async function downloadAllImages(url) {
    try {
        const images = await getImages(url);

        if (images.length === 0) {
            console.log(`No images found on ${url}. Stopping further traversal.`);
            return;
        }
        console.log(`Found ${images.length} images to download...`);
        const downloadPromises = images.map((imageUrl) => {
            return new Promise((resolve, reject) => {
                const worker = new Worker('./downloadWorker.mjs', {
                    workerData: { imageUrl },
                });

                worker.on('message', (message) => {
                    console.log(`Downloading ${message}...`);
                    if (message === 'success') {
                        resolve();
                    } else if (message === 'skip') {
                        reject(new Error('Image size is smaller than 500x500. Skipping download.'));
                    }
                });

                worker.on('error', (error) => {
                    reject(error);
                });

                worker.on('exit', (code) => {
                    if (code !== 0) {
                        reject(new Error(`Worker stopped with exit code ${code}`));
                    }
                });
            });
        });
        await Promise.all(downloadPromises);

        console.log('All images downloaded successfully.');
    } catch (error) {
        console.error('Error downloading images:', error);
    }
}

const timeStart = Date.now();
const baseUrl = 'http://d15.876515.xyz/XiuRen/16251';

// **** 修改此处为需要下载的页数 ****
const pageCount = 38;

(async () => {
    try {
        await downloadAllImages(baseUrl + '.html');

        for (let i = 1; i <= pageCount; i++) {
            console.log(`Processing page ${i}...`);
            const url = `${baseUrl}_${i}.html`;
            await downloadAllImages(url);
        }
        const timeEnd = Date.now();
        const timeDiff = (timeEnd - timeStart) / 1000;
        console.log(`Downloaded ${pageCount * 3} images in ${timeDiff} seconds.`);
    } catch (error) {
        console.error('Error processing pages:', error);
    }
})();