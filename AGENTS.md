# AGENTS.md — Platform Spoofer

Chrome 拡張機能（Manifest V3）、ビルド/テスト/lint ツールなし。ピュア Vanilla JS。

## 目的

任意のサイトで User-Agent / Client Hints（platform）を偽装する汎用ツール。特定のサイトに依存しない中立設計。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `manifest.json` | 拡張機能のメタデータ。`version` はセマンティックバージョニングで管理 |
| `background.js` | Service Worker。`declarativeNetRequest` の動的ルールと `chrome.scripting` による MAIN world 注入を管理。有効リストのサイトのみ自動適用 |
| `profiles/*.js` | 偽装プロファイルのテンプレート（`{V}` は実行時に Chrome メジャーバージョンに置換）。各ファイルが `self.__PS_PROFILE__` を定義 |
| `spoof.js` | MAIN world / `document_start` で実行。`self.__PS_PROFILE__` を読み `navigator.userAgent` / `platform` / `userAgentData` を上書き |
| `popup.html` / `popup.js` | ポップアップ。現在のサイトの追加/削除（追加時は `permissions.request`）、有効サイト一覧と削除（削除時は `permissions.remove`）、偽装先プロファイル選択、現在のタブのリロード |
| `README.md` | セットアップ・動作確認手順 |

## アーキテクチャ

- **偽装方式**: `declarativeNetRequestWithHostAccess`（ヘッダ書換）+ `chrome.scripting.registerContentScripts`（JS 上書き）。debugger を使わないため infobar は出ない
  - ヘッダ: `User-Agent` / `Sec-CH-UA` / `Sec-CH-UA-Mobile` / `Sec-CH-UA-Platform` / `Sec-CH-UA-Full-Version-List` を `requestDomains` 条件で有効サイトのみ `modifyHeaders`
  - JS: `profiles/<profile>.js` + `spoof.js` を `world:"MAIN"` / `runAt:"document_start"` / `allFrames:true` で有効サイト（`origin + "/*"`）に注入。`spoof.js` は `getChromeVersion()` でバージョンを動的解決し `brandList` の `{V}` を置換
- **プロファイル**: `profiles/*.js` で管理（`windows-chrome` / `macos-chrome` / `windows-edge`）。各プロファイルは `ua`（`{V}` 含む）/ `platform` / `vendor` / `brandList` / `platformName` / `platformVersion` / `architecture` / `bitness` を持つ。`background.js` の `PROFILES` は `label` と `file` の対応のみ保持
- **偽装値の生成**:
  - UA 文字列は `cfg.ua` の `{V}` を `getChromeVersion()`（サービスワーカーの `navigator.userAgent` から動的取得）で置換
  - ヘッダ / `userAgentData` の brands / fullVersionList は `cfg.brandList` から同様に生成（`mobile:false` 固定）
- **サイト単位の適用**:
  - 「サイト」はオリジン（`new URL(url).origin`、例: `https://example.com`）で判定。パス・クエリは無視、サブドメインは別サイト
  - 追加/削除/プロファイル切替時に `rebuildAll()`（`rebuildRules` + `rebuildContentScripts`）で DNR 動的ルールと登録済みコンテンツスクリプトを再構築
  - `chrome.permissions.onAdded` / `onRemoved` で Chrome 側から権限が付与/取り消された場合、該当オリジンを `spooferSites` に追加/削除して再構築（権限ダイアログでポップアップが閉じても一覧と偽装が同期される）
  - SPA 遷移は DNR / 注入が自動適用されるため追加処理不要。読み込み済みページは popup の「現在のタブをリロード」で反映
- **状態管理**: `chrome.storage.local` の `spooferSites`（オリジンの配列、デフォルト空）/ `spooferProfile`（デフォルト `"windows-chrome"`）に保存。`chrome.permissions` の付与状態と二重管理し、`onAdded`/`onRemoved` で同期
- **権限モデル**: `optional_host_permissions: ["<all_urls>"]`。ポップアップでサイト追加時に `permissions.request({origins:[origin+"/*"]})`（ユーザージェスチャー必須）、削除時に `permissions.remove` で同時取り消し。メッセージは `return true` で SW を維持し確実に完了させる。拡張機能メニューでは未許可時は「サイトへのアクセス時に確認」グループに表示される

## データフロー

```
popup.js
  → chrome.permissions.request({origins:[origin+"/*"]})  // 追加時のみ
  → chrome.runtime.sendMessage({type:"getStatus" | "addSite" | "removeSite" | "setProfile"})
  → background.js → chrome.storage.local に保存 → rebuildAll()
      → declarativeNetRequest.updateDynamicRules  // ヘッダ
      → scripting.registerContentScripts          // JS (profiles/<profile>.js + spoof.js)

http(s) タブ（有効サイト）
  → DNR がリクエストヘッダを書き換え
  → document_start で spoof.js が navigator を上書き
```

## 注意点

- **バージョン追従**: 偽装 UA の Chrome バージョンは `navigator.userAgent` から動的取得。ブラウザ更新時に自動追従（`{V}` 置換）
- **既知の制限**: MAIN world 注入のため Dedicated/Shared Worker や Service Worker 内の `navigator` は偽装対象外
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
