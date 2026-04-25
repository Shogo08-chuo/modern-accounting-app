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
  description = "Optional application database connection string. If null, the RDS URL is generated from this Terraform config."
  type        = string
  sensitive   = true
  default     = null
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
  description = "API container image tag to deploy to ECS"
  type        = string
  default     = "latest"
}

variable "frontend_image_tag" {
  description = "Frontend container image tag to deploy to ECS"
  type        = string
  default     = "latest"
}

variable "cors_allowed_origins" {
  description = "Additional allowed browser origins for the API CORS policy."
  type        = list(string)
  default     = ["http://localhost:3000"]
}

variable "db_subnet_group_name" {
  description = "DB subnet group name used by the existing RDS instance."
  type        = string
  default     = "default"
}

variable "custom_domain_name" {
  description = "Optional custom domain name for the ALB, such as app.example.com."
  type        = string
  default     = ""
}

variable "route53_zone_id" {
  description = "Route 53 hosted zone ID for the custom domain. Either this or route53_zone_name is required when custom_domain_name is set."
  type        = string
  default     = ""
}

variable "route53_zone_name" {
  description = "Route 53 hosted zone name for the custom domain, such as example.com. Used only when route53_zone_id is empty."
  type        = string
  default     = ""
}

locals {
  custom_domain_name          = trimspace(var.custom_domain_name)
  route53_zone_lookup_enabled = local.custom_domain_name != "" && trimspace(var.route53_zone_id) == "" && trimspace(var.route53_zone_name) != ""
  route53_zone_id             = trimspace(var.route53_zone_id) != "" ? trimspace(var.route53_zone_id) : try(data.aws_route53_zone.custom[0].zone_id, "")
  custom_domain_enabled       = local.custom_domain_name != "" && local.route53_zone_id != ""
  generated_database_url      = "postgresql://postgres:${urlencode(var.db_password)}@${aws_db_instance.default.address}:5432/${aws_db_instance.default.db_name}?schema=public"
  api_database_url            = var.database_url != null && trimspace(var.database_url) != "" ? var.database_url : local.generated_database_url
  alb_origin                  = local.custom_domain_enabled ? "https://${local.custom_domain_name}" : "http://${aws_lb.app.dns_name}"
  api_cors_origins            = join(",", distinct(concat(var.cors_allowed_origins, [local.alb_origin])))
}

# 既存stateとの互換のため残しています。RDS/ECSはRDSの既存VPCを使います。
resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = {
    Name = "accounting-app-vpc"
  }
}

data "aws_db_subnet_group" "current" {
  name = var.db_subnet_group_name
}

data "aws_route53_zone" "custom" {
  count        = local.route53_zone_lookup_enabled ? 1 : 0
  name         = var.route53_zone_name
  private_zone = false
}

# データベース(RDS)の設定
resource "aws_db_instance" "default" {
  allocated_storage   = 20
  engine              = "postgres"
  engine_version      = "16"
  instance_class      = "db.t3.micro"
  db_name             = "accounting_db"
  username            = "postgres"
  password            = var.db_password
  apply_immediately   = true
  publicly_accessible = false
  skip_final_snapshot = true
}

resource "aws_ecr_repository" "api" {
  name                 = "modern-accounting-api"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_repository" "frontend" {
  name                 = "modern-accounting-frontend"
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_security_group" "alb" {
  name        = "accounting-app-alb-sg"
  description = "Public HTTP access to the application load balancer"
  vpc_id      = data.aws_db_subnet_group.current.vpc_id

  tags = {
    Name = "accounting-app-alb-sg"
  }
}

resource "aws_security_group_rule" "alb_http_ingress" {
  type              = "ingress"
  description       = "HTTP from internet"
  from_port         = 80
  to_port           = 80
  protocol          = "tcp"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_https_ingress" {
  count             = local.custom_domain_enabled ? 1 : 0
  type              = "ingress"
  description       = "HTTPS from internet"
  from_port         = 443
  to_port           = 443
  protocol          = "tcp"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "alb_egress_all" {
  type              = "egress"
  description       = "Outbound to ECS tasks"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.alb.id
  cidr_blocks       = ["0.0.0.0/0"]
}

# 名前は既存stateとの互換でapp_runnerのままですが、ECS tasks用のSGとして使います。
resource "aws_security_group" "app_runner" {
  name        = "accounting-app-apprunner-sg"
  description = "Outbound access from App Runner services"
  vpc_id      = data.aws_db_subnet_group.current.vpc_id

  tags = {
    Name = "accounting-app-apprunner-sg"
  }
}

resource "aws_security_group_rule" "ecs_tasks_from_alb" {
  type                     = "ingress"
  description              = "HTTP from ALB to frontend and API tasks"
  from_port                = 3000
  to_port                  = 3001
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app_runner.id
  source_security_group_id = aws_security_group.alb.id
}

resource "aws_security_group_rule" "ecs_tasks_egress_all" {
  type              = "egress"
  description       = "Outbound from ECS tasks"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  security_group_id = aws_security_group.app_runner.id
  cidr_blocks       = ["0.0.0.0/0"]
}

resource "aws_security_group_rule" "app_runner_to_rds" {
  type                     = "egress"
  description              = "PostgreSQL from ECS tasks to RDS"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.app_runner.id
  source_security_group_id = tolist(aws_db_instance.default.vpc_security_group_ids)[0]
}

resource "aws_security_group_rule" "rds_from_app_runner" {
  type                     = "ingress"
  description              = "PostgreSQL from ECS tasks"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = tolist(aws_db_instance.default.vpc_security_group_ids)[0]
  source_security_group_id = aws_security_group.app_runner.id
}

# 名前は既存stateとの互換でapprunnerのままですが、ECS task execution roleとして使います。
resource "aws_iam_role" "apprunner_ecr_access" {
  name = "modern-accounting-apprunner-ecr-access"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "ecs-tasks.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/ecs/modern-accounting-api"
  retention_in_days = 7
}

resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/modern-accounting-frontend"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "app" {
  name = "modern-accounting-cluster"
}

resource "aws_lb" "app" {
  name               = "modern-accounting-alb"
  internal           = false
  load_balancer_type = "application"
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_db_subnet_group.current.subnet_ids
}

resource "aws_acm_certificate" "app" {
  count             = local.custom_domain_enabled ? 1 : 0
  domain_name       = local.custom_domain_name
  validation_method = "DNS"

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "certificate_validation" {
  for_each = local.custom_domain_enabled ? {
    for option in aws_acm_certificate.app[0].domain_validation_options : option.domain_name => {
      name   = option.resource_record_name
      record = option.resource_record_value
      type   = option.resource_record_type
    }
  } : {}

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = local.route53_zone_id
}

resource "aws_acm_certificate_validation" "app" {
  count                   = local.custom_domain_enabled ? 1 : 0
  certificate_arn         = aws_acm_certificate.app[0].arn
  validation_record_fqdns = [for record in aws_route53_record.certificate_validation : record.fqdn]
}

resource "aws_route53_record" "app" {
  count   = local.custom_domain_enabled ? 1 : 0
  name    = local.custom_domain_name
  type    = "A"
  zone_id = local.route53_zone_id

  alias {
    evaluate_target_health = true
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
  }
}

resource "aws_lb_target_group" "frontend" {
  name                 = "modern-accounting-frontend"
  port                 = 3000
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.aws_db_subnet_group.current.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/frontend-health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }
}

resource "aws_lb_target_group" "api" {
  name                 = "modern-accounting-api"
  port                 = 3001
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = data.aws_db_subnet_group.current.vpc_id
  deregistration_delay = 30

  health_check {
    enabled             = true
    healthy_threshold   = 2
    interval            = 30
    matcher             = "200-399"
    path                = "/health"
    protocol            = "HTTP"
    timeout             = 5
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener" "https" {
  count             = local.custom_domain_enabled ? 1 : 0
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  certificate_arn   = aws_acm_certificate_validation.app[0].certificate_arn
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.frontend.arn
  }
}

resource "aws_lb_listener_rule" "api_core" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/health", "/accounts", "/accounts/*", "/journal-entries", "/journal-entries/*"]
    }
  }
}

resource "aws_lb_listener_rule" "https_api_core" {
  count        = local.custom_domain_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/health", "/accounts", "/accounts/*", "/journal-entries", "/journal-entries/*"]
    }
  }
}

resource "aws_lb_listener_rule" "api_reports" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 11

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/reports/*", "/ledger/*"]
    }
  }
}

resource "aws_lb_listener_rule" "https_api_reports" {
  count        = local.custom_domain_enabled ? 1 : 0
  listener_arn = aws_lb_listener.https[0].arn
  priority     = 11

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.api.arn
  }

  condition {
    path_pattern {
      values = ["/reports/*", "/ledger/*"]
    }
  }
}

resource "aws_ecs_task_definition" "api" {
  family                   = "modern-accounting-api"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.apprunner_ecr_access.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "api"
      image     = "${aws_ecr_repository.api.repository_url}:${var.app_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 3001
          hostPort      = 3001
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "DATABASE_URL"
          value = local.api_database_url
        },
        {
          name  = "CORS_ORIGINS"
          value = local.api_cors_origins
        },
        {
          name  = "BASIC_AUTH_USER"
          value = var.basic_auth_user
        },
        {
          name  = "BASIC_AUTH_PASSWORD"
          value = var.basic_auth_password
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.api.name
          awslogs-region        = "ap-northeast-1"
          awslogs-stream-prefix = "api"
        }
      }
    }
  ])
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "modern-accounting-frontend"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.apprunner_ecr_access.arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"
      essential = true
      portMappings = [
        {
          containerPort = 3000
          hostPort      = 3000
          protocol      = "tcp"
        }
      ]
      environment = [
        {
          name  = "API_BASE_URL"
          value = local.alb_origin
        },
        {
          name  = "NEXT_PUBLIC_API_BASE_URL"
          value = "/api/backend"
        },
        {
          name  = "BASIC_AUTH_USER"
          value = var.basic_auth_user
        },
        {
          name  = "BASIC_AUTH_PASSWORD"
          value = var.basic_auth_password
        }
      ]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = aws_cloudwatch_log_group.frontend.name
          awslogs-region        = "ap-northeast-1"
          awslogs-stream-prefix = "frontend"
        }
      }
    }
  ])
}

resource "aws_ecs_service" "api" {
  name                 = "modern-accounting-api"
  cluster              = aws_ecs_cluster.app.id
  task_definition      = aws_ecs_task_definition.api.arn
  desired_count        = 1
  launch_type          = "FARGATE"
  force_new_deployment = true

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.app_runner.id]
    subnets          = data.aws_db_subnet_group.current.subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.api.arn
    container_name   = "api"
    container_port   = 3001
  }

  depends_on = [
    aws_lb_listener_rule.api_core,
    aws_lb_listener_rule.api_reports
  ]
}

resource "aws_ecs_service" "frontend" {
  name                 = "modern-accounting-frontend"
  cluster              = aws_ecs_cluster.app.id
  task_definition      = aws_ecs_task_definition.frontend.arn
  desired_count        = 1
  launch_type          = "FARGATE"
  force_new_deployment = true

  network_configuration {
    assign_public_ip = true
    security_groups  = [aws_security_group.app_runner.id]
    subnets          = data.aws_db_subnet_group.current.subnet_ids
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 3000
  }

  depends_on = [aws_lb_listener.http]
}

output "api_ecr_repository_url" {
  value = aws_ecr_repository.api.repository_url
}

output "frontend_ecr_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "alb_url" {
  value = local.alb_origin
}

output "load_balancer_url" {
  value = "http://${aws_lb.app.dns_name}"
}

output "custom_domain_url" {
  value = local.custom_domain_enabled ? "https://${local.custom_domain_name}" : null
}

output "api_health_url" {
  value = "${local.alb_origin}/health"
}
