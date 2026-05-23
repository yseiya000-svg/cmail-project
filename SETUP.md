# Cmail セットアップガイド

このドキュメントは2つの読者を対象にしています：

- **👤 利用者向け**（友達やパートナーなど、Cmailを使うだけの人）→ §1
- **🛠 開発者向け**（Seiya、コードを変更して配布する人）→ §2 以降

---

## §1. 利用者向けセットアップ（インストール）

1. Seiya から共有された GitHub Releases ページから最新の `Cmail-Setup-x.x.x.exe` をダウンロード
2. ダブルクリックでインストーラ起動
   - Windows SmartScreen 警告が出たら：「詳細情報」→「実行」
   - インストール先を選択（既定でOK）
3. インストール完了 → デスクトップの **Cmail** アイコンをダブルクリック
4. 初回起動時：
   - Google でログイン（Gmailアカウント）
   - Anthropic Console から取得した API キーを入力（オンボーディングモーダルが表示されます）
5. 完了！

### 利用者が用意するもの

- **Google アカウント**（Gmail）
- **Anthropic API キー** — https://console.anthropic.com/settings/keys から取得（クレジットカード登録要、利用料金は本人負担）
- ※ Seiya 側で OAuth テストユーザー登録が必要なので、事前に Gmail アドレスを伝えること

### アップデート

アプリ起動時に自動でチェック → 新しいバージョンがあれば通知 → 「再起動して更新」で完了。

---

## §2. 開発者向け：初回セットアップ

### 2-1. Node.js のインストール

1. https://nodejs.org にアクセスして LTS 版をインストール
2. ターミナルで確認:
   ```
   node --version
   npm --version
   ```

### 2-2. Google Cloud Console

1. https://console.cloud.google.com → プロジェクト作成
2. **API とサービス → ライブラリ** で「Gmail API」を有効化
3. **API とサービス → 認証情報** で「OAuth クライアント ID」作成
   - アプリの種類：**ウェブアプリケーション**
   - 承認済みのリダイレクト URI：`http://localhost:3000/api/auth/callback/google`
4. **OAuth 同意画面** → テストユーザーに使う Gmail アドレスを追加（自分＋友達など）

### 2-3. `.env.local` を作成（開発用）

`.env.example` をコピーして `.env.local` を作成し、値を埋める。最小構成：

```
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
# 残りはオプション。Electron が起動時に NEXTAUTH_SECRET を自動生成します。
# ANTHROPIC_API_KEY は配布版では設定画面から入力するため未設定でOK
```

### 2-4. 依存インストール & 起動

```powershell
cd "E:\Claude Projects\Cmail Project"
npm install
npm run app          # Electron + Next.js 開発モード
```

---

## §3. リリース（インストーラのビルド & 配布）

### 3-1. GitHub リポジトリの準備（初回のみ）

1. GitHub にプライベートリポジトリを作成：
   ```
   gh repo create cmail --private --source=. --remote=origin
   ```
   または手動で GitHub Web 上で作成 → `git remote add origin git@github.com:<USERNAME>/cmail.git`

2. `package.json` の `build.publish.owner` を **自分の GitHub ユーザー名**に置き換え：
   ```json
   "publish": [{
     "provider": "github",
     "owner": "your-actual-github-username",
     ...
   }]
   ```

3. **GitHub Personal Access Token (PAT)** を発行：
   - https://github.com/settings/tokens → 「Generate new token (classic)」
   - スコープ：`repo`（プライベートリポジトリへの release 書き込みのため）
   - 発行されたトークンをコピー

4. PAT を環境変数 `GH_TOKEN` に設定（PowerShell）：
   ```powershell
   [Environment]::SetEnvironmentVariable("GH_TOKEN", "ghp_xxxxx...", "User")
   ```
   PowerShellを再起動。

### 3-2. ローカルビルド確認

実際にリリースする前にローカルでビルド試験：

```powershell
npm run dist
```

→ `release/Cmail-Setup-0.1.0.exe` が生成されます。ダブルクリックでインストール→動作確認。

### 3-3. 本番リリース

1. コード変更してコミット
2. `package.json` の `version` を bump（例：`0.1.0` → `0.1.1`）
3. リリース：
   ```powershell
   npm run release
   ```
4. electron-builder が以下を自動で実行：
   - Next.js ビルド
   - Electron アプリ化
   - インストーラ生成
   - GitHub Releases に `Cmail-Setup-0.1.1.exe` + `latest.yml` をアップロード（タグ `v0.1.1` で公開）

5. **既にCmailをインストール済みのすべてのユーザー**は次回起動時（または5秒後）に自動で更新を検知 → ダウンロード → 「再起動して更新」で適用。

### 3-4. リリース後のチェックリスト

- [ ] GitHub Releases ページに `Cmail-Setup-x.x.x.exe` と `latest.yml` の両方が公開されている
- [ ] バージョン番号が package.json と一致
- [ ] 既存インストール環境で自動更新通知が来る

---

## §4. セキュリティに関する注意事項

### 4-1. `.env.local` は絶対にコミットしない

`.gitignore` に登録済みですが、誤って `git add .env.local` しないよう注意。

### 4-2. 各ユーザーは自分の API キーを持つ（BYOK）

Claude API キーは **配布版に埋め込まれません**。各ユーザーが自分のキーを設定画面から入力する仕組みです。キーは `%APPDATA%\Cmail\cmail-settings.json` にローカル保存されます。

### 4-3. 信頼できる人にだけ配布

OAuth は「テスト中」のままなので：
- テストユーザーに登録した Gmail アドレスからしかログインできません
- 100ユーザーまでの上限あり
- 一般公開するには Google の本人確認 + CASA セキュリティ監査が必要（数十万円〜）

→ **個人利用・親しい人限定**で運用する前提です。

### 4-4. Windows SmartScreen 警告について

未署名のインストーラは初回起動時に「Windowsによって PC が保護されました」と表示されます。これを消すには **EVコード署名証明書（年額数万円〜）** が必要。今は警告を許容して進めています（利用者には「詳細情報」→「実行」を押してもらう）。

---

## §5. 学習データについて

- 返信を送信するたびに `<Obsidianパス>/reply-patterns.json` に自動保存
- 設定画面で Obsidian フォルダのパスを変更可能（空欄にすると学習機能OFF）
- iCloud 経由で他のデバイスと自動同期される
- 同じ送信者へのメールでは過去の返信パターンが参考にされ、精度が上がっていきます

ユーザー独自の文体ルールを書きたい場合は、設定したフォルダ内に `my-preferences.md` を作って自由に記述してください。
