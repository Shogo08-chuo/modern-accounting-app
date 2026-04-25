# Modern Accounting App

## Local development

API:

```bash
npm install
npm run dev
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

`.env.example` と `frontend/.env.example` をコピーして、それぞれ `.env` / `frontend/.env.local` を作成します。

- API: `DATABASE_URL`, `PORT`, `CORS_ORIGINS`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`
- Frontend: `API_BASE_URL`, `NEXT_PUBLIC_API_BASE_URL`, `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`

Frontend は `/api/backend/*` 経由でAPIへアクセスします。Basic認証ヘッダーはNext.jsサーバー側で付与するため、ブラウザに認証情報を出しません。

## AWS deployment shape

Terraform は以下を作成します。

- API用ECR repository
- Frontend用ECR repository
- Application Load Balancer
- ECS Fargate cluster
- API用ECS service
- Frontend用ECS service
- CloudWatch Logs
- ECS taskからRDSへ接続するSecurity Group rule
- Optional Route 53 + ACM certificate + HTTPS listener

Frontend と API は同じ `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` でBasic認証されます。ALBのヘルスチェック用に `/frontend-health` だけは認証なしで公開します。

初回はECR repositoryを先に作成し、API/FrontendのDocker imageをpushしてからECS serviceを作成します。

```bash
cd terraform
terraform init
terraform apply \
  -target=aws_ecr_repository.api \
  -target=aws_ecr_repository.frontend
```

ECRにログインしてimageをpushしたあと、全体をapplyします。

```bash
AWS_ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
AWS_REGION="ap-northeast-1"

aws ecr get-login-password --region "$AWS_REGION" \
  | docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"

docker build -t modern-accounting-api .
API_ECR_URL="$(terraform output -raw api_ecr_repository_url)"
docker tag modern-accounting-api:latest "${API_ECR_URL}:latest"
docker push "${API_ECR_URL}:latest"

docker build -t modern-accounting-frontend ./frontend
FRONTEND_ECR_URL="$(terraform output -raw frontend_ecr_repository_url)"
docker tag modern-accounting-frontend:latest "${FRONTEND_ECR_URL}:latest"
docker push "${FRONTEND_ECR_URL}:latest"

terraform apply \
  -var='basic_auth_user=admin' \
  -var='basic_auth_password=change_me_strong_password' \
  -var='db_password=change_me_rds_password'
```

公開URLはapply後に確認できます。

```bash
terraform output alb_url
```

独自ドメインとHTTPSを有効にする場合は、Route 53 hosted zoneが必要です。

```bash
terraform apply \
  -var='basic_auth_user=admin' \
  -var='basic_auth_password=change_me_strong_password' \
  -var='db_password=change_me_rds_password' \
  -var='custom_domain_name=app.example.com' \
  -var='route53_zone_name=example.com'
```

試験運用ではAPIコンテナ起動時に `prisma migrate deploy` を実行します。正式運用ではECS one-off taskなど、VPC内で動く専用のmigration jobに分けるのがおすすめです。
