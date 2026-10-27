/*
  posts/ 폴더의 Markdown 파일을 읽어 posts.json을 자동 생성합니다.
  사용법: npm run build:posts
  각 Markdown 파일 맨 위에 아래 형식의 메타데이터를 적어 주세요.

  ---
  title: "작업 제목"
  category: "journal"
  date: "2026-10-15"
  credit: "YCW"
  ---

  category는 journal / magazines / column / poem 중 하나여야 합니다.
*/
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const postsDir = path.join(root, "posts");
const output = path.join(root, "posts.json");
const allowed = new Set(["journal", "magazines", "column", "poem"]);

function parseFrontMatter(text, filename) {
  const match = text.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*(?:\r?\n|$)/);
  const meta = {};
  if (match) {
    for (const line of match[1].split(/\r?\n/)) {
      const pair = line.match(/^([a-zA-Z_-]+)\s*:\s*(.*?)\s*$/);
      if (pair) meta[pair[1]] = pair[2].replace(/^["']|["']$/g, "");
    }
  }
  const body = match ? text.slice(match[0].length) : text;
  const heading = body.match(/^#\s+(.+)$/m);
  const title = meta.title || (heading ? heading[1].trim() : path.basename(filename, ".md").replace(/[-_]/g, " "));
  const category = allowed.has(meta.category) ? meta.category : "journal";
  const date = meta.date || "";
  const credit = meta.credit || "YCW";
  const slug = path.basename(filename, ".md");
  return {id: slug, category, title, date, file: `posts/${filename}`, credit};
}

if (!fs.existsSync(postsDir)) fs.mkdirSync(postsDir, {recursive:true});
const files = fs.readdirSync(postsDir).filter(name => name.toLowerCase().endsWith(".md")).sort();
const posts = files.map(name => parseFrontMatter(fs.readFileSync(path.join(postsDir, name), "utf8"), name));
fs.writeFileSync(output, JSON.stringify(posts, null, 2) + "\n", "utf8");
console.log(`posts.json updated: ${posts.length} Markdown file(s) found.`);
