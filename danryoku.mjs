import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sizeOf from 'image-size';

// 获取当前脚本文件的绝对路径
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// **** 配置区域 - 后期需要修改的参数 ****
const CONFIG = {
    baseUrl: 'https://img.danryoku.com/2025/10',  // 基础URL
    baseId: 'XR-Uncensored-汁汁_-R18-秀人网模特-实习期女秘书',                          // 图片ID前缀 
    maxCount: 100,                               // 最大尝试下载数量
    imageFormat: 'webp'                          // 图片格式
};

// 添加延迟函数
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 从URL中提取原始文件名
function getOriginalFileName(url) {
    const urlParts = url.split('/');
    return urlParts[urlParts.length - 1];
}

async function downloadImage(url) {
    try {
        // 创建保存文件的目录
        const saveDirectory = path.join(__dirname, 'pictures');
        if (!fs.existsSync(saveDirectory)) {
            fs.mkdirSync(saveDirectory, { recursive: true });
        }

        // 获取原始文件名
        const originalFileName = getOriginalFileName(url);
        const absoluteFilePath = path.join(saveDirectory, originalFileName);
        
        // 检查文件是否已存在
        if (fs.existsSync(absoluteFilePath)) {
            console.log(`文件已存在，跳过下载: ${originalFileName}`);
            return 'exists';
        }

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Referer': CONFIG.baseUrl,
                'Origin': new URL(CONFIG.baseUrl).origin,
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'same-origin',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            redirect: 'follow',
            timeout: 30000 // 30秒超时
        });

        if (!response.ok) {
            console.log(`Image not found: ${url} (${response.status})`);
            return false;
        }

        const buffer = await response.buffer();

        // 获取图片尺寸
        const dimensions = sizeOf(buffer);
        const { width, height } = dimensions;

        // 检查图片尺寸是否小于500x500
        if (width < 500 || height < 500) {
            console.log(`Image size is smaller than 500x500 (${width}x${height}). Skipping: ${originalFileName}`);
            return false;
        }

        fs.writeFileSync(absoluteFilePath, buffer);
        console.log(`Downloaded: ${originalFileName} (${width}x${height})`);
        return true;
    } catch (error) {
        console.error(`Error downloading ${url}:`, error.message);
        return false;
    }
}

// 生成图片ID的函数
function generateImageIds(baseId, count) {
    const ids = [];
    const baseIdWithoutNumber = baseId.replace(/-\d+$/, ''); // 移除末尾的数字
    
    for (let i = 1; i <= count; i++) {
        // TODO 这里要看情况改
        if (i < 10) {
            ids.push(`${baseIdWithoutNumber}.0${i}P`);
        } else {
            ids.push(`${baseIdWithoutNumber}.${i}P`);
        }
        // ids.push(`${baseIdWithoutNumber}-${i}`);
    }
    
    return ids;
}

// 构造完整的图片URL
function buildImageUrl(imageId) {
    return `${CONFIG.baseUrl}/${imageId}.${CONFIG.imageFormat}`;
}

async function downloadImagesByConfig() {
    const timeStart = Date.now();
    const imageIds = generateImageIds(CONFIG.baseId, CONFIG.maxCount);
    
    console.log(`开始下载 ${imageIds.length} 张图片...`);
    console.log(`基础URL: ${CONFIG.baseUrl}`);
    console.log(`图片ID前缀: ${CONFIG.baseId}`);
    
    let successCount = 0;
    let skipCount = 0;
    let existsCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < imageIds.length; i++) {
        const imageId = imageIds[i];
        const imageUrl = buildImageUrl(imageId);
        
        console.log(`正在处理 ${i + 1}/${imageIds.length}: ${imageId}`);
        
        const result = await downloadImage(imageUrl);
        
        if (result === true) {
            successCount++;
        } else if (result === 'exists') {
            existsCount++;
        } else if (result === false) {
            // 检查是否是404错误（图片不存在）
            try {
                const testResponse = await fetch(imageUrl, { method: 'HEAD' });
                if (testResponse.status === 404) {
                    console.log(`图片不存在，停止继续尝试: ${imageId}`);
                    break; // 如果图片不存在，停止继续尝试
                }
            } catch (e) {
                // 忽略测试请求的错误
            }
            
            skipCount++;
        }
        
        // 添加延迟避免请求过快
        await delay(500);
    }
    
    const timeEnd = Date.now();
    const timeDiff = (timeEnd - timeStart) / 1000;
    
    console.log(`\n下载完成！`);
    console.log(`成功下载: ${successCount} 张`);
    console.log(`文件已存在: ${existsCount} 张`);
    console.log(`跳过: ${skipCount} 张`);
    console.log(`总耗时: ${timeDiff.toFixed(2)} 秒`);
}

// 主程序
(async () => {
    try {
        await downloadImagesByConfig();
    } catch (error) {
        console.error('程序执行出错:', error);
    }
})();