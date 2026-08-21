# Platform Spoofer — Chrome 拡張機能 (Manifest V3)

任意のサイトで User-Agent / Client Hints（platform）を偽装する汎用拡張機能です。特定のサイトに依存しない中立な UA 切替ツールとして動作します。

## 仕組み

- `chrome.debugger` でタブに接続し、`Emulation.setUserAgentOverride` を送信
- DevTools のデバイスエミュレーションと同一の仕組みで、以下をまとめて偽装
  - `User-Agent` 文字列
  - `Sec-CH-UA-*` 系ヘッダ（`Sec-CH-UA-Platform` など）
  - `navigator.userAgentData` / `navigator.platform`
- Chrome バージョンは実行環境から動的に取得するため、ブラウザ更新に追従します

## セットアップ

1. `chrome://extensions` を開く
2. デベロッパーモード をオンにする
3. 「パッケージ化されていない拡張機能を読み込む」をクリック
4. このディレクトリを選択

## 使い方

- 拡張機能アイコン → ポップアップで動作を制御
  - **現在のサイト**: 表示中のページのオリジン（`https://example.com` など）を有効リストへ追加 / 削除
  - **偽装先**: Windows/Chrome, macOS/Chrome, Windows/Edge から選択（全サイト共通）
  - **有効なサイト**: 有効になっているサイトの一覧。各行の「削除」で解除
  - **現在のタブをリロード**: 既に読み込み済みのページへ確実に反映する場合に使用
- 有効化したサイトのオリジンは `chrome.storage.local` に保存され、ブラウザ再起動後も維持されます

## 動作確認

1. ポップアップで任意の http(s) サイトを追加する
2. そのサイトのページを開き（読み込み済みならリロードし）、F12 → Network → リクエストヘッダで `Sec-CH-UA-Platform` が選択プロファイルの値になっていることを確認
3. コンソールで `navigator.userAgentData.platform` / `navigator.platform` を確認

## 注意点

- この拡張機能は任意のサイトで UA を偽装する汎用ツールです。サイトの利用規約は各自の責任で確認してください
- **権限の範囲**: この拡張機能は `debugger` 権限を用い、有効リストに追加されたサイトのタブのみ UA / Client Hints を偽装します。リストから削除すると該当タブの偽装が解除され、実環境に戻ります
- **infobar**: 方式の都合上、debugger 接続時にブラウザ上部へ「デバッグ中」の通知が表示されます（仕様）
- 適用先サイトの仕様変更により、期待する表示にならない場合があります

## 更新時

`chrome://extensions` で拡張機能カードの更新ボタンをクリック後、既存のタブもリロードする。