# CookCook - YouTube 食谱自动生成工具

一个使用 AI 自动从 YouTube 烹饪视频生成食谱的工具，支持从播放列表或频道提取视频链接，并使用 Google Gemini AI 生成详细的 Markdown 格式食谱。

## 功能特性

- 🎬 **从 YouTube 提取视频链接**：支持播放列表和频道链接提取
- 🤖 **AI 生成食谱**：使用 Google Gemini 2.5 Pro 模型自动生成详细食谱
- 📝 **Markdown 格式**：生成规范的 Markdown 食谱文件
- 💾 **增量处理**：自动跟踪已处理视频，避免重复处理
- 📊 **处理统计**：生成详细的处理日志和统计信息
- 🔄 **断点续传**：支持中断后继续处理

## 项目结构

```
cookcook/
├── main.js                  # 主程序（食谱生成）
├── ymp.sh                   # 视频链接提取脚本
├── proxy-setup.js           # 代理配置
├── .env                     # 环境变量配置
├── .processed_urls.json     # 已处理记录
├── lib/
│   ├── logger.js           # 日志模块
│   └── tracker.js          # 处理跟踪模块
├── logs/                    # 日志文件目录
├── out/                     # 输出目录（生成的食谱和 URL 列表）
└── scripts/
    └── check_duplicates.sh  # 去重检查脚本
```

## 环境配置

### 1. 安装依赖

```bash
npm install
```

### 2. 创建 `.env` 文件

在项目根目录创建 `.env` 文件，配置以下内容：

```env
# Google Cloud 配置
GEMINI_API_KEY=your_api_key_here
GOOGLE_CLOUD_PROJECT=your_project_id
GOOGLE_CLOUD_LOCATION=us-central1

# 输入文件路径
JSON_FILE=./out/out_urls.json
```

**获取配置信息：**
1. **GEMINI_API_KEY**：从 [Google AI Studio](https://aistudio.google.com/app/apikey) 获取
2. **GOOGLE_CLOUD_PROJECT**：从 Google Cloud Console 获取项目 ID
3. **GOOGLE_CLOUD_LOCATION**：Google Cloud 区域，默认 `us-central1`

### 3. 系统依赖

确保已安装：
- **Node.js** >= 14
- **yt-dlp**：用于提取 YouTube 视频链接
  ```bash
  # 使用 pip 安装
  pip install yt-dlp
  ```
- **jq**：JSON 命令行处理工具
  ```bash
  # Windows (使用 Chocolatey)
  choco install jq
  # macOS
  brew install jq
  # Linux
  sudo apt-get install jq
  ```

## 使用方法

### 一：使用脚本提取视频链接

#### 从播放列表提取

```bash
./ymp.sh playlist <PLAYLIST_ID>
```

**示例：**
```bash
./ymp.sh playlist PLxxxxxxxxxx
```

#### 从频道提取

```bash
./ymp.sh @channel_name
# 或
./ymp.sh channel https://www.youtube.com/@LaoFanGu/videos
```

**示例：**
```bash
./ymp.sh @LaoFanGu
./ymp.sh channel https://www.youtube.com/@LaoFanGu/videos
```

**输出：** 生成 `out/<频道名称>_urls.json` 文件，包含所有视频链接

### 二：生成食谱

#### 自动处理（推荐）

```bash
npm run start
```

程序会自动：
1. 扫描 `./out` 目录下的所有 `*_urls.json` 文件
2. 读取其中的视频链接
3. 跳过已处理的视频
4. 为每个视频生成食谱
5. 保存为 Markdown 文件到 `./out` 目录

#### 指定输入文件

```bash
npm run start -- --input=./out/频道名称_urls.json
# 或简写
npm run start -- -i ./out/频道名称_urls.json
```

#### 使用环境变量

```bash
export INPUT_JSON=./out/频道名称_urls.json
npm run start
```

## 输出说明

### 生成的食谱文件

- **位置**：`./out/<食谱名称>.md`
- **格式**：Markdown
- **内容包括**：
  - 食谱名称（一级标题）
  - 食材列表（无序列表）
  - 烹饪步骤（有序列表）
  - 技术总结和灵魂配料评点

### 日志文件

- **位置**：`./logs/`
- **文件名**：`YYYY-MM-DD.log`
- **内容**：完整的处理日志，包括成功、失败和跳过的记录

### 处理记录

- **文件**：`.processed_urls.json`
- **作用**：记录已处理的视频 URL，避免重复处理
- **自动管理**：每次成功处理后自动更新
- **删除**：重新处理视频URL
## 完整工作流示例

```bash
# 1. 配置环境变量
# 编辑 .env 文件

# 2. 从频道提取视频链接
./ymp.sh @LaoFanGu

# 3. 生成食谱
npm run start

# 输出：
# - out/老飯骨學堂_urls.json（视频链接列表）
# - out/食谱1.md
# - out/食谱2.md
# - out/食谱3.md
# - logs/2024-11-28.log
```

## 故障排除

### 问题：找不到 yt-dlp 或 jq

**解决**：确保已安装必要的系统依赖
```bash
pip install yt-dlp
# Windows: choco install jq
# macOS: brew install jq
# Linux: sudo apt-get install jq
```

### 问题：GOOGLE_CLOUD_PROJECT 未定义

**解决**：确保 `.env` 文件配置正确
```bash
# 检查 .env 文件是否存在
cat .env

# 确保包含必要的环境变量
GEMINI_API_KEY=...
GOOGLE_CLOUD_PROJECT=...
```

### 问题：Permission denied: Consumer suspended

**可能原因**：
- Google Cloud API 配额超限
- 账户被限制或禁用
- API 未启用

**解决**：
1. 检查 Google Cloud Console 的 API 配额
2. 查看账户状态和使用限制
3. 确保 Vertex AI API 已启用

### 问题：yt-dlp 下载超时

**解决**：
- 检查网络连接
- 使用代理（见 `proxy-setup.js`）
- 手动配置 yt-dlp 代理参数

## 高级配置

### 代理设置

编辑 `proxy-setup.js` 配置代理：

```javascript
process.env.HTTP_PROXY = 'http://proxy:port';
process.env.HTTPS_PROXY = 'http://proxy:port';
```

### 模型切换

在 `main.js` 中修改模型选择：

```javascript
// 使用 2.5-flash（更快）
model: 'gemini-2.5-flash',

// 或使用 2.5-pro（更准确）
model: 'gemini-2.5-pro',
```

## 相关命令

| 命令 | 说明 |
|------|------|
| `npm run start` | 运行主程序生成食谱 |
| `./ymp.sh @channel` | 提取频道视频链接 |
| `./ymp.sh playlist <ID>` | 提取播放列表视频链接 |
| `cat .processed_urls.json` | 查看已处理记录 |
| `ls out/` | 查看输出文件 |

## 注意事项

1. **速率限制**：Google AI 可能有速率限制，如果遇到限制，程序会自动重试
2. **视频质量**：确保视频有清晰的音频和字幕，AI 生成效果会更好
3. **隐私视频**：私有和已删除的视频会自动过滤
4. **去重**：所有视频链接会自动去重
5. **增量处理**：已处理的视频不会重复处理

## 许可证

ISC

## 贡献

欢迎提交 Issue 和 Pull Request！

---

**最后更新**：2025年11月28日
