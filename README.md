# Platform Spoofer — Chrome 拡張機能 (Manifest V3)

任意のサイトで User-Agent / Client Hints（platform）を偽装する汎用拡張機能です。特定のサイトに依存しない中立な UA 切替ツールとして動作します。

## 仕組み

- `declarativeNetRequest` でリクエストヘッダ（`User-Agent` / `Sec-CH-UA*`）を書き換え
- `chrome.scripting` で `MAIN` world に `spoof.js` を `document_start` 注入し、`navigator.userAgent` / `navigator.platform` / `navigator.userAgentData` を上書き（`getHighEntropyValues()` 含む）
- デバッグ接続を使わないため、infobar（「デバッグ中」表示）は出ません
- Chrome バージョンは実行環境から動的に取得するため、ブラウザ更新に追従します

## セットアップ

1. `chrome://extensions` を開く
2. デベロッパーモード をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このディレクトリを選択

## 使い方

- 拡張機能アイコン → ポップアップで動作を制御
  - **現在のサイト**: 表示中のページのオリジン（`https://example.com` など）を有効リストへ追加 / 削除
    - 初回追加時、Chrome の権限ダイアログでそのサイトへのアクセス許可を求められます（サイト単位の `optional_host_permissions`）
  - **偽装先**: Windows/Chrome, macOS/Chrome, Windows/Edge から選択（全サイト共通）
  - **有効なサイト**: 有効になっているサイトの一覧。各行の「削除」で解除（偽装設定とアクティブな権限を取り消します）
  - **現在のタブをリロード**: 既に読み込み済みのページへ確実に反映する場合に使用
- 有効化したサイトのオリジンは `chrome.storage.local` に保存され、ブラウザ再起動後も維持されます
  - サイトを削除するとそのサイトの偽装は無効になります。ただし Chrome 130 以降では、`chrome://extensions` の「Automatically allow access on the following sites（次のサイトで自動的にアクセスを許可）」に削除したサイトが残る場合があります。これは Chrome が「付与済み権限（granted）セット」を表示する仕様によるもので、**残っていてもそのサイトの偽装は動作しません**（`chrome.permissions.contains` は `false` を返します）。メニューから完全に消去したい場合は、拡張機能の詳細で該当サイトを手動で削除してください。

## 動作確認

1. ポップアップで任意の http(s) サイトを追加し、権限ダイアログで許可する
2. そのサイトのページを開き（読み込み済みならリロードし）、F12 → Network → リクエストヘッダで `Sec-CH-UA-Platform` が選択プロファイルの値になっていることを確認
3. コンソールで `navigator.userAgent` / `navigator.userAgentData.platform` / `navigator.platform` / `await navigator.userAgentData.getHighEntropyValues(["platformVersion","architecture"])` を確認

## 注意点

- この拡張機能は任意のサイトで UA を偽装する汎用ツールです。サイトの利用規約は各自の責任で確認してください
  - **権限の範囲**: `optional_host_permissions` により、有効リストに追加したサイトのオリジンにのみヘッダ書換と JS 偽装を適用します。サイトを削除するとアクティブな権限は取り消されますが、Chrome 130 以降は `chrome://extensions` の許可一覧（granted セット）に残る場合があります。これは Chrome の表示仕様であり、実際の偽装は停止しています。完全に消去するには拡張機能メニューの「Automatically allow access on the following sites」から手動で削除してください。
- 適用先サイトの仕様変更により、期待する表示にならない場合があります
- **既知の制限**: `MAIN` world 注入のため、Dedicated/Shared Worker や Service Worker 内の `navigator` は偽装対象外です

## 更新時

`chrome://extensions` で拡張機能カードの更新ボタンをクリック後、既存のタブもリロードする。
0.3.x 以前から更新する場合、`host_permissions` が `optional_host_permissions` に移行されたため、既存の有効サイトは再追加（再許可）が必要です。
