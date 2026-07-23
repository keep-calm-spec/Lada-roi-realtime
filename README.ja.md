# Demask ROI Lada

[English](README.md) | [简体中文](README.zh-CN.md) | 日本語

Demask ROI Lada は、Windows 向けの透明な画面全体対応 ROI（関心領域）
モザイク修復オーバーレイです。マウスポインター周辺の正方形領域をキャプチャし、
NVIDIA GPU 上で Lada BasicVSR++ v1.2 時系列修復モデルをローカル実行します。

画面キャプチャ方式で動作するため、ブラウザーの DOM 構造や動画プレーヤーの
実装には依存しません。動画を事前にダウンロードする必要はなく、JAV を含む
対応する Web 動画を視聴しながらリアルタイムで処理できます。

> [!IMPORTANT]
> モデルの出力は映像内容に基づく妥当な再構成であり、元のピクセルを復元する
> ものではありません。使用権限のあるメディアのみを処理してください。

## 主な機能

- 画面全体で使用できる、クリック透過型 ROI オーバーレイ
- 256×256 RGB のモデル入出力
- 5 フレームの時系列履歴
- CUDA Graph を使用した PyTorch CUDA FP16 推論
- 英語による状態とパフォーマンスの表示
- 完全なローカル処理（フレームはアップロードされません）

## 動作要件

- 64 ビット版 Windows 10 または Windows 11
- CUDA 対応 NVIDIA GPU
- CUDA 12.6 と互換性のある NVIDIA ドライバー
- Node.js LTS と npm
- Python 環境管理用の [uv](https://docs.astral.sh/uv/)
- CUDA ランタイム全体の準備とパッケージ作成時に 15 GiB 以上の空き容量

NVIDIA GeForce RTX 2060（VRAM 6 GiB）搭載環境で動作確認済みです。

## ポータブル版のダウンロード

ビルド済みの Windows 版を Google Drive からダウンロードできます。

[Demask ROI 1.1.1 ポータブル版をダウンロード](https://drive.google.com/file/d/1ZcgaqtrlxZW-xtvB92efo9zSdFoL9eYk/view?usp=drive_link)

SHA-256：

```text
1c0bde55db6b1c228e0384b2911116bb631e58e6e018fd50392e7bc0e4fd03e5
```

ポータブル版には、推論ワーカー、モデル、PyTorch、CUDA ランタイム、
cuDNN が含まれています。Python や CUDA Toolkit を別途インストールする
必要はありませんが、互換性のある NVIDIA ドライバーは必要です。

## ソースコードからのクイックスタート

以下を実行します。

```text
setup-dev.cmd
start-roi.cmd
```

`setup-dev.cmd` は、再現可能なローカル環境を自動的に構築します。

1. uv を使用して、プロジェクト内に Python 3.12 ランタイムをインストールします。
2. `.venv-lada` を作成します。
3. PyTorch 2.8.0 CUDA 12.6 とワーカーの依存関係をインストールします。
4. `npm ci` でロックされた Electron の依存関係をインストールします。
5. 公式 Lada モデルをダウンロードし、SHA-256 チェックサムを検証します。

Python ランタイムとパッケージキャッシュは、すべてプロジェクトディレクトリ内に
保存されます。リポジトリを別のドライブに配置すれば、大容量の開発用依存関係で
システムドライブを圧迫せずに済みます。

## モデルの重み

モデルの重みは Git リポジトリに含まれていません。次のスクリプトで必要な
重みをダウンロードしてください。

```text
download-model.cmd
```

スクリプトは次のファイルをダウンロードします。

```text
models/lada_mosaic_restoration_model_generic_v1.2.pth
```

想定される SHA-256：

```text
d404152576ce64fb5b2f315c03062709dac4f5f8548934866cd01c823c8104ee
```

ダウンロード元は公式の
[ladaapp/lada Hugging Face リポジトリ](https://huggingface.co/ladaapp/lada)です。

## ショートカット

- `Ctrl+R`：ROI のオン／オフ
- `Ctrl+=`：ROI を拡大
- `Ctrl+-`：ROI を縮小
- `Ctrl+Q`：終了

アプリケーションの実行中、これらはグローバルショートカットとして動作し、
フォアグラウンドアプリケーション内の同じキー操作より優先されます。

## ポータブルアプリケーションのビルド

以下を実行します。

```text
build-portable.cmd
```

ビルドは 2 段階で行われます。

1. PyInstaller が `worker-dist` にスタンドアロンの CUDA 推論ワーカーを生成します。
2. electron-builder が Electron、ワーカー、モデルを
   `dist/Demask-ROI-<version>-portable.exe` にパッケージ化します。

ポータブル実行ファイルは PyTorch、CUDA、cuDNN を含むため、約 1.6 GiB です。
実行先の PC に Python や CUDA Toolkit は不要ですが、互換性のある
NVIDIA ドライバーは必要です。

ポータブル版の一時展開先をリポジトリと同じドライブにするには、次のスクリプト
から起動してください。

```text
start-portable.cmd
```

## 処理の流れ

1. Electron がプライマリディスプレイをキャプチャします。
2. 透明ウィンドウがマウス入力を妨げずにポインターを追跡します。
3. ROI を 256×256 RGB にリサイズし、バイナリ IPC で送信します。
4. Lada ワーカーが 5 フレームのスライディングウィンドウを保持します。
5. キャプチャ済みの CUDA Graph を使用して BasicVSR++ を実行します。
6. 最新の修復フレームをオーバーレイに返して表示します。

最初の 4 フレームは時系列履歴の蓄積に使用され、5 フレーム目から修復結果が
表示されます。マウスを大きく動かした場合や ROI のサイズを変更した場合は、
時系列履歴がリセットされます。

DRM で保護されたコンテンツは、Windows の画面キャプチャ API では黒く表示
される場合があります。

## リポジトリ構成

```text
desktop/                 Electron のメイン、プリロード、レンダラー、UI
python/lada_worker.py    バイナリ IPC と CUDA 推論ワーカー
scripts/                 再現可能なモデルダウンロードツール
vendor/lada/             特定の上流コミットに固定した Lada ソース
models/                  ローカルモデルの重み（Git の対象外）
requirements-worker.txt  Python ワーカーの直接依存関係
setup-dev.cmd            再現可能な Windows 開発環境セットアップ
build-portable.cmd       Windows ポータブル版のビルドエントリーポイント
```

生成された環境、モデルの重み、ビルド出力、実行ファイル、キャッシュは
`.gitignore` で除外されています。ポータブル実行ファイルはソースリポジトリに
直接コミットせず、GitHub Release の添付ファイルとして公開してください。

## プロジェクトを支援する

このプロジェクトが役立った場合は、次の ETH 互換ウォレットアドレスから
継続的な開発を支援できます。

```text
0x50a85a684ed4e5abb9e57c823acf72a9c21f79d7
```

送金前に、ウォレットアドレスと選択したネットワークを必ず確認してください。
ブロックチェーン取引は取り消せません。

## 上流プロジェクトとライセンス

同梱されている Lada ソースは
[`ladaapp/lada`](https://github.com/ladaapp/lada) のコミット
`20cb34a20a83c72c87a991d2c949032c70085b16` に固定されています。

本プロジェクトは GNU Affero General Public License v3.0 の下で公開されています。
詳細は [LICENSE](LICENSE) および
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) を参照してください。
