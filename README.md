# File Preview

Next.jsベースのファイルプレビューアプリケーション

## 技術スタック

- **Framework**: Next.js 16.2.0
- **UI**: React 19.2.4
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Runtime**: Bun

## 前提条件

- Bun 1.0以上

## インストール

```bash
bun install
```

## 開発

```bash
bun dev
```

[http://localhost:3000](http://localhost:3000) で開発サーバーが起動します。

## ビルド

```bash
bun run build
```

## 本番実行

```bash
bun start
```

## プロジェクト構造

```
├── app/              # Next.js App Router
├── components/       # Reactコンポーネント
├── hooks/            # カスタムフック
├── lib/              # ユーティリティ関数
├── public/           # 静的ファイル
├── styles/           # グローバルスタイル
└── app/              # ページとレイアウト
```

## ライセンス

MIT
