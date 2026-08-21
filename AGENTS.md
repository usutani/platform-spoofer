# AGENTS.md — Platform Spoofer

Chrome 拡張機能（Manifest V3）、ビルド/テスト/lint ツールなし。ピュア Vanilla JS。

## 目的

任意のサイトで User-Agent / Client Hints（platform）を偽装する汎用ツール。特定のサイトに依存しない中立設計。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 拡張機能のメタデータ。`version` はセマンティックバージョニングで管理 |
| `background.js` | Service Worker。`chrome.debugger` でタブに接続し `Emulation.setUserAgentOverride` を送信。有効リストのサイトのみ自動適用 |
| `popup.html` / `popup.js` | ポップアップ。現在のサイトの追加/削除、有効サイト一覧と削除、偽装先プロファイル選択、現在のタブのリロード |
| `README.md` | セットアップ・動作確認手順 |

## アーキテクチャ

- **偽装方式**: `chrome.debugger.attach({tabId}, "1.3")` → `Emulation.setUserAgentOverride`。DevTools のデバイスエミュレーションと同一機構
- **プロファイル**: `PROFILES` マップで管理（`windows-chrome` / `macos-chrome` / `windows-edge`）。各プロファイルは `label` / `platform`（navigator.platform 用）/ `brand` / `platformName` / `platformVersion` / `architecture` / `bitness` / `ua(ver)` を持つ
- **偽装値の生成**:
  - UA 文字列はプロファイルの `ua(ver)` を利用。`ver` は `getChromeVersion()` がサービスワーカーの `navigator.userAgent` から動的取得
  - `userAgentMetadata` は `buildUserAgentMetadata(profile)` が生成。brands / fullVersionList の 3 番目にプロファイルの `brand` を設定（`mobile:false` 固定）
- **サイト単位の適用**:
  - 「サイト」はオリジン（`new URL(url).origin`、例: `https://example.com`）で判定。パス・クエリは無視、サブドメインは別サイト
  - `chrome.tabs.onUpdated`（status: `"loading"`）でオリジンが有効リストに含まれれば `applyOverride(tabId)` を実行
  - 含まれないタブが `attachedTabs` に残っていれば `detach`（偽装済みサイトから別サイトへ遷移した場合の後始末）
  - `chrome.runtime.onStartup` / `onInstalled` で既存タブにも反映
  - SPA 遷移では debugger がタブに保持されるため、再適用不要（フルリロード時のみ再発火）
- **状態管理**: `chrome.storage.local` の `spooferSites`（オリジンの配列、デフォルト空）/ `spooferProfile`（デフォルト `"windows-chrome"`）に保存。追加/削除/プロファイル切替時は既存タブへ即時反映（リロードはしない。読み込み済みページは popup の「現在のタブをリロード」で反映）
- **後始末**: サイト削除時は該当オリジンのタブを `detachOrigin` で解除。`chrome.tabs.onRemoved` / `chrome.debugger.onDetach` で `attachedTabs` Set を更新。Service Worker 再起動で Set が失われるため、起動時に `syncAttachedTabs()`（`chrome.debugger.getTargets`）で復元する

## データフロー

```
popup.js
  → chrome.runtime.sendMessage({type:"getStatus" | "addSite" | "removeSite" | "setProfile"})
  → background.js → chrome.storage.local に保存 → 既存タブへ再適用 / 該当タブを detach

http(s) タブ
  → chrome.tabs.onUpdated (loading)
  → オリジンが有効リストに含まれれば applyOverride(tabId) / 含まれなければ detach
      → chrome.debugger.attach → Emulation.setUserAgentOverride
```

## 注意点

- **デバッグ接続の競合**: DevTools を開いているタブでは `debugger.attach` / `sendCommand` が失敗する。`applyOverride` は例外を捕捉して警告ログに抑止する
- **バージョン追従**: 偽装 UA の Chrome バージョンはサービスワーカーの `navigator.userAgent` から動的取得。ブラウザ更新時に自動追従
- **infobar**: debugger 接続時、ブラウザ上部に「デバッグ中」の通知が表示される（chrome.debugger の仕様）
- **プライバシー / 規約**: 適用先サイトの利用規約の確認はユーザー各自の責任。拡張機能自体はサイト非依存の汎用ツールとして設計する

## 開発ルール

### 作業開始手順
- 作業を始める前に `git checkout -b <branch-name>` で master からブランチを作成する

### コミット手順（必ずこの順で実行）
1. `manifest.json` のバージョンを更新（fix → patch、feat → minor）。必ずユーザーに確認
2. 実装を行いコミット（コミットは必ずユーザー確認後に実行）
3. プッシュ前に `AGENTS.md` / `README.md` が実装と一致していることを確認する
4. 不一致があれば修正してコミット → プッシュ（`&&` で連結せず別々に）
5. プッシュ後、`gh pr create` → `gh pr merge --squash --delete-branch` でマージするかユーザーに確認する

### 更新後の手順
1. `chrome://extensions` で拡張機能を再読み込み（更新アイコン / トグルオフ→オン）
2. 既存のタブもリロード