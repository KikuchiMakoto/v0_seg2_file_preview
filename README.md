# File Preview

Next.jsベースのファイルプレビューアプリケーション

## 技術スタック

- **Framework**: Next.js 16.2.0
- **UI**: React 19.2.4
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Package Manager**: pnpm

## 前提条件

- Node.js 18.17以上
- pnpm

## インストール

```bash
# pnpmが未インストールの場合
npm install -g pnpm

# 依存関係のインストール
pnpm install
```

## 開発

```bash
pnpm dev
```

[http://localhost:3000](http://localhost:3000) で開発サーバーが起動します。

## ビルド

```bash
pnpm build
```

## 本番実行

```bash
pnpm start
```

## リント

```bash
pnpm lint
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
