// const {GoogleGenAI} = require('@google/genai');
import './proxy-setup.js'; // Load proxy setup first
import { GoogleGenAI } from '@google/genai';
import fs from 'fs/promises';
import path from 'path';

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';

async function generateText(
  ytUrl,
  projectId = GOOGLE_CLOUD_PROJECT || 'gen-lang-client-0847415551',
  location = GOOGLE_CLOUD_LOCATION || 'global'
) {
  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
  });

  const prompt = `请根据视频内容生成一份详细的食谱，必须严格使用 Markdown 格式。
要求：
1. 第一行必须是食谱名称（使用 # 一级标题）。
2. 包含“食材”部分（使用无序列表）。
3. 包含“步骤”部分（使用有序列表）。
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

  try {
      const response = await client.models.generateContent({
        // model: 'gemini-2.5-flash',
        model: 'gemini-2.5-pro',
        contents: [ytVideo, prompt],
      });

      console.log(`Response for ${ytUrl} generated.`);
      let text = response.text;
      
      // Clean up: remove markdown code block delimiters if present
      if (text.startsWith('```markdown')) {
          text = text.replace(/^```markdown\s*/, '').replace(/\s*```$/, '');
      } else if (text.startsWith('```')) {
          text = text.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      return text;
  } catch (error) {
      console.error(`Error processing ${ytUrl}:`, error);
      return null;
  }
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

async function main() {
  const jsonFilePath = '面点合集/12.json'; // Change this to your target JSON file
  
  try {
    console.log(`Reading URLs from ${jsonFilePath}...`);
    const dirPath = path.dirname(jsonFilePath);
    const fileContent = await fs.readFile(jsonFilePath, 'utf-8');
    const urls = JSON.parse(fileContent);

    if (!Array.isArray(urls)) {
        throw new Error('JSON content is not an array of URLs');
    }

    for (const url of urls) {
        console.log(`Processing: ${url}`);
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
                console.warn(`Could not extract title from content, using fallback filename: ${fileName}`);
            }

            const filePath = path.join(dirPath, fileName);
            await fs.writeFile(filePath, content);
            console.log(`Saved: ${filePath}`);
        }
    }
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

main();