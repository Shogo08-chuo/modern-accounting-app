# 課題と解決方法

実装時に意識した課題と、採用した解決方法をまとめます。

## 1. 複式簿記の整合性をどこで守るか

### 課題

仕訳は借方と貸方が一致して初めて会計データとして成立します。UI だけで検証すると、API を直接叩いた場合に不正データが保存される可能性があります。

### 解決

`src/routes/journalEntries.ts` の `validateJournalEntryPayload` で、API 層の入力検証を実装しました。

- `entryDate` が有効な日付であること
- `description` が空でないこと
- 明細が 2 行以上あること
- 借方と貸方がそれぞれ 1 行以上あること
- 金額が正の数値であること
- 借方合計と貸方合計が一致すること

これにより、フロントエンド以外の経路から API を利用しても会計ルールを維持できます。

## 2. ヘッダと明細の保存を原子的に扱う

### 課題

仕訳伝票は `JournalEntry` と複数の `JournalEntryLine` で構成されます。ヘッダだけ保存され、明細保存に失敗すると、表示や集計で破綻します。

### 解決

Prisma の `$transaction` を使い、ヘッダ作成と明細作成を 1 つの処理単位にしました。どちらかが失敗した場合は全体をロールバックします。

## 3. 勘定科目区分による残高計算

### 課題

資産・費用は借方で増加し、負債・純資産・収益は貸方で増加します。同じ金額でも、勘定科目区分によって残高への影響が変わります。

### 解決

フロントエンドの元帳表示では `calculateSignedAmount` を用意し、勘定科目区分と貸借区分から符号付き金額を計算しています。API の財務諸表サマリでも同じ会計ルールに基づいて B/S と P/L を集計しています。

## 4. 認証情報をブラウザに露出しない API 接続

### 課題

フロントエンドから API を直接呼び出す構成で Basic 認証情報を扱うと、ブラウザに認証情報が露出します。

### 解決

Next.js の Route Handler を API proxy として利用しました。ブラウザは `/api/backend/*` にアクセスし、Next.js サーバー側が Hono API へ認証ヘッダーを付与して転送します。

## 5. ローカル開発と AWS デプロイの差を小さくする

### 課題

ローカルでは動くがクラウドでは動かない、という状態を避けるためには、DB、環境変数、ヘルスチェック、ログ出力、ネットワーク構成を事前に整理する必要があります。

### 解決

- ローカル DB は Docker Compose の PostgreSQL で再現
- API / Frontend は Docker multi-stage build でコンテナ化
- Terraform で ALB、ECS Fargate、RDS、ECR、CloudWatch Logs を定義
- `/health` と `/frontend-health` を ALB health check に利用
- CORS origin と Basic 認証情報を環境変数で制御

## 6. API 仕様と実装の対応関係を見える化する

### 課題

選考やレビューでは、コードだけでは API の全体像が伝わりにくい場合があります。

### 解決

`docs/openapi.yaml` に OpenAPI 3.0 形式でエンドポイント、request/response schema、エラー応答を記載しました。実装を読む前に API 契約を把握できます。

## 今後の改善余地

現状は仕訳バリデーションの単体テスト、ビルド、lint をローカルで確認でき、同じ確認を行う GitHub Actions workflow 例を `docs/github-actions-ci.example.yml` に置いています。さらに品質を上げるなら、以下を追加します。

- 財務諸表集計ロジックの単体テスト
- API の integration test
- OpenAPI schema と実装の差分検知
- Terraform plan を pull request で確認する CI
