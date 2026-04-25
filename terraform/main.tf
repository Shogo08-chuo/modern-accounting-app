# AWSを使うための設定
terraform {
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# 東京リージョンに作りますという宣言
provider "aws" {
  region = "ap-northeast-1"
}

variable "db_password" {
  description = "RDS master password"
  type        = string
  sensitive   = true
}

variable "database_url" {
  description = "Application database connection string for App Runner"
  type        = string
  sensitive   = true
}

variable "basic_auth_user" {
  description = "Basic auth username for the API"
  type        = string
}

variable "basic_auth_password" {
  description = "Basic auth password for the API"
  type        = string
  sensitive   = true
}

variable "app_image_tag" {
  description = "Container image tag to deploy to App Runner"
  type        = string
  default     = "latest"
}

# 試しに「ネットワーク（VPC）」を一つ定義してみる
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true

  tags = {
    Name = "accounting-app-vpc"
  }
}
# データベース(RDS)の設定
resource "aws_db_instance" "default" {
  allocated_storage   = 20
  engine              = "postgres"
  engine_version      = "16"
  instance_class      = "db.t3.micro" # 無料枠（t3.micro）を指定
  db_name             = "accounting_db"
  username            = "postgres"
  password            = var.db_password
  skip_final_snapshot = true
  publicly_accessible = true # 自分のPCから接続テストするために一時的にON
}

resource "aws_ecr_repository" "api" {
  name                 = "modern-accounting-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name = "modern-accounting-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "build.apprunner.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

resource "aws_apprunner_service" "api" {
  service_name = "modern-accounting-api"

  source_configuration {
    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    auto_deployments_enabled = false

    image_repository {
      image_identifier      = "${aws_ecr_repository.api.repository_url}:${var.app_image_tag}"
      image_repository_type = "ECR"

      image_configuration {
        port = "3001"

        runtime_environment_variables = {
          PORT                = "3001"
          DATABASE_URL        = var.database_url
          BASIC_AUTH_USER     = var.basic_auth_user
          BASIC_AUTH_PASSWORD = var.basic_auth_password
        }
      }
    }
  }

  health_check_configuration {
    healthy_threshold   = 1
    interval            = 10
    path                = "/health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 5
  }
}

output "ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "app_runner_service_url" {
  value = aws_apprunner_service.api.service_url
}
