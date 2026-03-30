# 时光纪（纯静态）

这是一个**纯静态**多板块页面（Vue 3 + CDN），可直接部署到 **GitHub Pages**，不依赖后端。

## 本地运行（不要直接双击）
项目使用 ES Module（`type="module"`），本地需要用静态服务器打开。

### 方式 1：Python（推荐）
在项目根目录运行：

```powershell
cd F:\birthday
python -m http.server 5500
```

浏览器打开：
- `http://localhost:5500/`

## 部署到 GitHub Pages
1. 上传仓库（包含根目录 `index.html` 与 `static/`）。
2. GitHub Pages 选择仓库根目录发布。
3. 如果仓库名是 `birthday6`，访问地址为：`https://<用户名>.github.io/birthday6/`

> 当前 `index.html` 已配置 `<base href="/birthday6/">`，如果你更换仓库名，请同步修改该路径。

## 替换资源（音乐/背景/照片）
- **音乐**：建议放到 `static/music/`，并在首页“音乐设置”中填写每首曲目的 `src`（例如 `./static/music/spring.mp3`）。
- **背景图**：首页“设置中心”可直接选择本地图片（仅本机生效）。
- **相册图片**：相册页“本地上传”可选多张图片，图片会压缩并保存到浏览器本地（IndexedDB）。

## 调试 URL 参数
- `?date=YYYY-MM-DD`：模拟日期（影响主题与解锁日期判断）
- `?theme=spring|summer|autumn|winter|birthday|anniversary`：强制主题
- `?bg=none`：强制不使用背景图
- `?motion=reduce|full`：强制动效模式

