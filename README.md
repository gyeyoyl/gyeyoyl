# EVERY MOVE LEAVES A TRACE — Portfolio

전시용 비선형 에디토리얼 포트폴리오 프로토타입입니다.

## 실행하기

1. 이 폴더를 VS Code로 엽니다.
2. VS Code 확장 프로그램에서 **Live Server**를 설치합니다.
3. `index.html`을 우클릭하고 **Open with Live Server**를 선택합니다.

`file://`로 직접 열면 브라우저 보안 때문에 `posts.json`과 Markdown을 불러오지 못할 수 있습니다.

## 새 글 추가하기

1. `posts/` 폴더에 `my-new-work.md` 같은 Markdown 파일을 만듭니다.
2. 파일 맨 위에 아래 메타데이터를 작성합니다.

```md
---
title: "새 작업 제목"
category: "column"
date: "2026-10-15"
credit: "YCW"
---

# 새 작업 제목

여기에 본문을 작성합니다.
```

`category`는 반드시 `journal`, `magazines`, `column`, `poem` 중 하나로 작성합니다.

3. VS Code 터미널에서 프로젝트 폴더 기준으로 다음 명령을 실행합니다.

```bash
npm run build:posts
```

그러면 `posts.json`이 `posts/` 안의 모든 Markdown 파일을 읽어 자동으로 갱신됩니다. 브라우저를 새로고침하면 글이 표시됩니다.

## GitHub Pages에 올릴 때

정적 웹사이트는 새 파일이 폴더에 생겼다는 사실만으로 폴더 내용을 자동 검색하지 못합니다. 새 Markdown을 추가한 뒤 `npm run build:posts`를 실행하고 `posts/`와 `posts.json`을 함께 GitHub에 올리면 배포된 사이트에도 반영됩니다.

## 디자인/동작

- 컬러: `#EB4587`, `#14040A`, `#f5f5f5`
- 카테고리: `journal / magazines / column / poem`
- 영문은 Mercator 우선 지정. Mercator 폰트 파일/웹폰트가 제공되지 않으면 시스템 대체 폰트가 표시됩니다. 사용권이 있는 Mercator 폰트 파일을 받으면 CSS에서 `@font-face`로 연결할 수 있습니다.
- 한글: Noto Sans KR
- 뒤로 가기 버튼, 키보드 Escape/Backspace, 트랙패드 가로 스와이프, 화면 최상단에서 위로 스크롤 제스처 지원
- 게시글 순서는 Shuffle 버튼으로 재배열 가능
