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
  allocated_storage    = 20
  engine               = "postgres"
  engine_version       = "16"
  instance_class       = "db.t3.micro" # 無料枠（t3.micro）を指定
  db_name              = "accounting_db"
  username             = "postgres"
  password             = var.db_password
  skip_final_snapshot  = true
  publicly_accessible  = true # 自分のPCから接続テストするために一時的にON
}
