// const {GoogleGenAI} = require('@google/genai');
import './proxy-setup.js'; // Load proxy setup first
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config();
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const errorKey = []
// 支持多个 API key，用逗号分隔
const GEMINI_API_KEYS = process.env.GEMINI_API_KEY
  ? process.env.GEMINI_API_KEY.split(',').map(key => key.trim()).filter(key => key.length > 0)
  : [];

if (GEMINI_API_KEYS.length === 0) {
  console.error('❌ 错误: 未找到 GEMINI_API_KEY 环境变量');
  process.exit(1);
}

// 请求间隔（毫秒），仅通过环境变量配置：REQUEST_DELAY_MS
const DEFAULT_REQUEST_DELAY_MS = 60000;
const REQUEST_DELAY_MS = (() => {
  const v = parseInt(process.env.REQUEST_DELAY_MS, 10);
  return (!Number.isNaN(v) && v >= 0) ? v : DEFAULT_REQUEST_DELAY_MS;
})();

import Logger from './lib/logger.js';
import ProcessedTracker from './lib/tracker.js';

const logger = new Logger();
const tracker = new ProcessedTracker();

async function generateText(
  ytUrl,
  projectId = GOOGLE_CLOUD_PROJECT,
  location = GOOGLE_CLOUD_LOCATION
) {
  const prompt = `请根据视频判断内容是否包含做菜教程，如果非做菜视频，就生成一则包括标题的摘要。如果是做菜视频则生成一份详细的食谱，必须严格使用 Markdown 格式。
要求：
1. 第一行必须是食谱名称（使用 # 一级标题，字数不超过10个汉字）。
2. 包含"食材"部分（使用无序列表）。
3. 包含"步骤"部分（使用有序列表）。
4. 直接输出 Markdown 内容，严禁使用代码块符号（\`\`\`）包裹。
5. 不要包含任何多余的对话、开场白或结束语。
6. 食材和调料的数量根据视频内容来估算，明确一点。
7. 最后要做技术总结，以及点评这道菜的灵魂配料。
`;

  const ytVideo = {
    fileData: {
      fileUri: ytUrl,
      mimeType: 'video/mp4',
    },
  };

  // 从环境变量读取模型名，默认使用 gemini-2.5-flash
  const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.5-flash';

  // 尝试所有可用的 API key
  for (let i = 0; i < GEMINI_API_KEYS.length; i++) {
    const apiKey = GEMINI_API_KEYS[i];
    if (errorKey.includes(apiKey)) {
      continue;
    }
    const client = new GoogleGenAI({
      apiKey: apiKey,
    });

    try {
      const response = await client.models.generateContent({
        model: GEMINI_MODEL,
        contents: [ytVideo, prompt],
      });
      if (response.text === undefined || response.text === null || response.text === '') { return null }
      console.log(`Response for ${ytUrl} generated using API key ${i + 1}/${GEMINI_API_KEYS.length} with model ${GEMINI_MODEL}.`);
      let text = response.text;
      // Clean up: remove markdown code block delimiters if present
      if (text.startsWith('```markdown')) {
        text = text.replace(/^```markdown\s*/, '').replace(/\s*```$/, '');
      } else if (text.startsWith('```')) {
        text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      return text;
    } catch (error) {
      const errorMsg = `❌ API key ${i + 1}/${GEMINI_API_KEYS.length} 使用模型 ${GEMINI_MODEL} 处理 ${ytUrl} 时出错: ${error.message || error}`;
      await logger.error(errorMsg);

      // console.log("error-------type--->", error.message)


      if (`${error.message || error}`.indexOf(`"code":429`) > -1) {
        errorKey.push(apiKey);
        // 如果不是最后一个 key，继续尝试下一个
        if (i < GEMINI_API_KEYS.length - 1) {
          await logger.log(`🔄 切换到下一个 API key (${i + 2}/${GEMINI_API_KEYS.length})...`);
          continue;
        }
      }
      return null;
    }
  }

  // 所有 key 都失败
  await logger.error(`❌ 所有 API key 都已尝试或无法处理 ${ytUrl}`);
  return null;
}

function sanitizeFilename(filename) {
  // Replace invalid filename characters with underscore
  return filename.replace(/[<>:"/\\|?*]/g, '_').trim();
}

function extractTitleFromMarkdown(content) {
  if (!content) return null;

  // Try to find the first Markdown header (# Title)
  const headerMatch = content.match(/^#\s+(.+)$/m);
  if (headerMatch) {
    return headerMatch[1].trim();
  }

  // Fallback: Find the first non-empty line that isn't a code block
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('```')) {
      // Remove common markdown formatting chars from the start if present (like ** or *)
      return trimmed.replace(/^[*#> -]+/, '').trim();
    }
  }

  return null;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  await logger.init();
  await tracker.load();


  await logger.log(`Using REQUEST_DELAY_MS=${REQUEST_DELAY_MS}ms`);



  // Parse CLI args or environment variables for input
  const argv = process.argv.slice(2);
  let inputArg = null;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--input=')) {
      inputArg = a.split('=')[1];
      break;
    }
    if (a === '--input' || a === '-i') {
      if (i + 1 < argv.length) {
        inputArg = argv[i + 1];
        break;
      }
    }
    // first non-flag positional argument
    if (!a.startsWith('-') && !inputArg) {
      inputArg = a;
      break;
    }
  }

  const envInput = process.env.INPUT_JSON || process.env.JSON_FILE || process.env.JSON_DIR;
  const specified = inputArg || envInput;

  // Determine whether specified path is file or dir. Defaults:
  // - if specified and is file -> process single file
  // - if specified and is dir -> process all *_urls.json in dir
  // - if not specified -> prefer './out/out_urls.json' if exists, otherwise './out' directory
  let targetFiles = [];

  const tryStat = async p => {
    try {
      return await fs.stat(p);
    } catch (e) {
      return null;
    }
  };

  if (specified) {
    const sstat = await tryStat(specified);
    if (sstat && sstat.isFile()) {
      targetFiles = [specified];
    } else if (sstat && sstat.isDirectory()) {
      const entries = await fs.readdir(specified, { withFileTypes: true });
      targetFiles = entries.filter(e => e.isFile() && e.name.endsWith('_urls.json')).map(e => path.join(specified, e.name));
    } else {
      // path doesn't exist as given; if it ends with .json treat as file path (may be created later)
      if (specified.endsWith('.json')) {
        targetFiles = [specified];
      } else {
        // treat as directory path, attempt to read
        try {
          const entries = await fs.readdir(specified, { withFileTypes: true });
          targetFiles = entries.filter(e => e.isFile() && e.name.endsWith('_urls.json')).map(e => path.join(specified, e.name));
        } catch (e) {
          // fallback to ./out
          targetFiles = [];
        }
      }
    }
  }

  if (!specified) {
    // prefer single default file if present
    const defaultFile = './out/out_urls.json';
    const dfStat = await tryStat(defaultFile);
    if (dfStat && dfStat.isFile()) {
      targetFiles = [defaultFile];
    } else {
      // scan out directory
      const defaultDir = './out';
      const dStat = await tryStat(defaultDir);
      if (dStat && dStat.isDirectory()) {
        const entries = await fs.readdir(defaultDir, { withFileTypes: true });
        targetFiles = entries.filter(e => e.isFile() && e.name.endsWith('_urls.json')).map(e => path.join(defaultDir, e.name));
      }
    }
  }

  if (targetFiles.length === 0) {
    await logger.log(`No target *_urls.json files found to process. Provide --input <file|dir> or place files under ./out`);
    return;
  }

  await logger.log(`Processing ${targetFiles.length} file(s):`);
  for (const f of targetFiles) await logger.log(`  - ${f}`);

  let successCount = 0;
  let failureCount = 0;
  let skippedCount = 0;
  const failedUrls = [];
  const skippedUrls = [];

  await logger.log(`Previously processed: ${tracker.processed.size}`);

  for (const jsonFilePath of targetFiles) {
    await logger.log(`\nReading URLs from ${jsonFilePath}...`);
    const dirPath = path.dirname(jsonFilePath);
    let fileContent;
    try {
      fileContent = await fs.readFile(jsonFilePath, 'utf-8');
    } catch (e) {
      await logger.error(`Failed to read ${jsonFilePath}: ${e.message || e}`);
      continue;
    }
    let urls;
    try {
      urls = JSON.parse(fileContent);
    } catch (e) {
      await logger.error(`Failed to parse JSON in ${jsonFilePath}: ${e.message || e}`);
      continue;
    }
    if (!Array.isArray(urls)) {
      await logger.error(`JSON content in ${jsonFilePath} is not an array of URLs, skipping.`);
      continue;
    }

    await logger.log(`Total URLs in file: ${urls.length}`);

    for (const url of urls) {
      if (errorKey.length === GEMINI_API_KEYS.length) {
        await logger.error(`All API keys have been rate-limited. Stopping processing.`);
        break;
      }
      // Skip if already processed
      if (tracker.has(url)) {
        await logger.log(`⏭️  Skipping (already processed): ${url}`);
        skippedCount++;
        skippedUrls.push(url);
        continue;
      }

      await logger.log(`\n📝 Processing: ${url}`);
      const content = await generateText(url);

      if (content) {
        let fileName;
        const extractedTitle = extractTitleFromMarkdown(content);

        if (extractedTitle) {
          fileName = `${sanitizeFilename(extractedTitle)}.md`;
        } else {
          // Fallback to video ID
          let videoId = 'unknown';
          try {
            const urlObj = new URL(url);
            videoId = urlObj.searchParams.get('v') || 'unknown';
          } catch (e) {
            const match = url.match(/[?&]v=([^&]+)/);
            if (match) videoId = match[1];
          }
          fileName = `Video_${videoId}.md`;
          await logger.warn(`Could not extract title from content, using fallback filename: ${fileName}`);
        }
        fileName.length > 25 && (fileName = fileName.slice(0, 20) + '.md'); // ensure filename length limit
        const filePath = path.join(dirPath, fileName);
        await fs.writeFile(filePath, content);
        await logger.log(`✅ Saved: ${filePath}`);
        successCount++;
        tracker.add(url); // Mark as processed
        // Save tracker after processing each successful URL (incremental)
        await tracker.save();
      } else {
        await logger.error(`Failed to generate recipe for: ${url}`);
        failureCount++;
        failedUrls.push(url);
        tracker.add(url);
        // Do NOT mark as processed if generation failed, so we can retry next time
      }
      // 等待配置的间隔后再处理下一个（毫秒）
      if (REQUEST_DELAY_MS > 0 && errorKey.length < GEMINI_API_KEYS.length) {
        await logger.log(`⏱️  Waiting ${REQUEST_DELAY_MS}ms before next request...`);
        await sleep(REQUEST_DELAY_MS);
      }
    }
  }



  // Summary log
  const separator = '='.repeat(70);
  await logger.log('\n' + separator);
  await logger.log('📊 Processing Summary');
  await logger.log(separator);
  await logger.log(`✅ Successful: ${successCount}`);
  await logger.log(`❌ Failed: ${failureCount}`);
  await logger.log(`⏭️  Skipped (already processed): ${skippedCount}`);
  await logger.log(`📈 Total: ${successCount + failureCount + skippedCount}`);

  if (failedUrls.length > 0) {
    await logger.log('\n❌ Failed URLs (will retry next run):');
    failedUrls.forEach((url, index) => {
      logger.log(`   ${index + 1}. ${url}`);
    });
  }
  await logger.log(separator);
  await logger.log(`\n✨ Log file saved to: ${logger.logPath}`);
  await logger.log(`📋 Processed records saved to: ${tracker.trackerFile}\n`);
}

main().catch(async (error) => {
  await logger.error(`Unhandled error: ${error.message || error}`);
  try {
    await tracker.save();
    await logger.log('💾 Tracker saved after crash');
  } catch (e) {
    console.error('Failed to save tracker after crash:', e);
  }
  process.exit(1);
});

